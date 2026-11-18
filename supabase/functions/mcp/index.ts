/**
 * MCP server for outside AI agents (Claude, ChatGPT and others). Stage three,
 * Part F (the MCP spike).
 *
 * Agents sign in as an existing user through Supabase Auth's OAuth 2.1 server,
 * and every tool runs with that user's token, so row-level security decides
 * what they see. The tool list comes from the tool catalog
 * (_shared/toolCatalog.ts), never from a list kept here.
 *
 * Sign-in discovery follows the MCP authorization spec: a request without a
 * valid token gets 401 with a WWW-Authenticate header pointing at this
 * server's protected-resource metadata, which names Supabase Auth as the
 * authorization server. `verify_jwt = false` in config.toml so that those
 * unauthenticated discovery requests reach this code; the token is checked
 * here instead.
 *
 * Stateless: a new server and transport per request, plain JSON responses.
 */
import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.32.2/server/webStandardStreamableHttp.js'
import { createClient } from 'npm:@supabase/supabase-js@2'

import { mcpTools, runTool, type ToolContext, ToolRefusal } from '../_shared/toolCatalog.ts'

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!
const RESOURCE_URL = `${PROJECT_URL}/functions/v1/mcp`
const METADATA_URL = `${RESOURCE_URL}/.well-known/oauth-protected-resource`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'www-authenticate',
}

/** Reads the default key from the JSON key set Supabase provides, or the legacy key. */
function publishableKey(): string {
  const set = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (set) {
    const key = JSON.parse(set).default
    if (typeof key === 'string' && key) return key
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY')
  if (!legacy) throw new Error('Missing SUPABASE_PUBLISHABLE_KEYS')
  return legacy
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...corsHeaders, ...headers } })
}

/** RFC 9728 protected-resource metadata: where agents should sign in. */
function resourceMetadata(): Response {
  return json({
    resource: RESOURCE_URL,
    authorization_servers: [`${PROJECT_URL}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Hosting test: orders (LAMO proof of concept)',
  })
}

function unauthorized(error?: 'invalid_token'): Response {
  const challenge = [`Bearer resource_metadata="${METADATA_URL}"`]
  if (error) challenge.push(`error="${error}"`)
  return json({ error: 'Sign in to use this server' }, 401, { 'WWW-Authenticate': challenge.join(', ') })
}

/** Builds a server whose tools run as the caller. */
function buildServer(ctx: ToolContext, clientId: string | undefined): McpServer {
  const server = new McpServer({ name: 'hosting-test-orders', version: '0.1.0' })
  for (const tool of mcpTools()) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { readOnlyHint: tool.access === 'read', openWorldHint: false },
      },
      async (input: unknown) => {
        const started = performance.now()
        try {
          const result = await runTool(tool, ctx, input)
          console.log('mcp: tool call', JSON.stringify({ tool: tool.name, client: clientId ?? null, ok: true, ms: Math.round(performance.now() - started) }))
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
        } catch (error) {
          const message = error instanceof ToolRefusal ? error.message : 'The tool could not run. Please try again.'
          console.log('mcp: tool call', JSON.stringify({ tool: tool.name, client: clientId ?? null, ok: false, reason: (error as Error).name }))
          return { isError: true, content: [{ type: 'text' as const, text: message }] }
        }
      },
    )
  }
  return server
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method === 'GET' && path.endsWith('/.well-known/oauth-protected-resource')) return resourceMetadata()

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token) return unauthorized()

  const db = createClient(PROJECT_URL, publishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // getClaims throws, rather than returning an error, on a token that is not a JWT at all.
  let auth: Awaited<ReturnType<typeof db.auth.getClaims>>['data'] = null
  try {
    const result = await db.auth.getClaims(token)
    if (!result.error) auth = result.data
  } catch {
    auth = null
  }
  if (auth?.claims.role !== 'authenticated' || !auth.claims.sub) return unauthorized('invalid_token')

  // Stateless server: only POST carries MCP messages; there is no event stream to open.
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' })

  const clientId = typeof auth.claims.client_id === 'string' ? auth.claims.client_id : undefined
  const server = buildServer({ db, userId: auth.claims.sub }, clientId)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  const response = await transport.handleRequest(req)
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value)
  return new Response(response.body, { status: response.status, headers })
})
