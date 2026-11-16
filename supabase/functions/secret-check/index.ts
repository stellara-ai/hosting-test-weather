/**
 * Reports whether the TEST_SECRET secret is set, without revealing it.
 * Signed-in callers only.
 *
 * The platform check (`verify_jwt = true` in supabase/config.toml) rejects
 * any request without a validly signed JWT before this code runs. The handler
 * then also requires that the token belongs to a signed-in user, so a signed
 * but anonymous key is refused as well.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders })
}

function isSignedInUser(req: Request): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const payload = token?.split('.')[1]
  if (!payload) return false
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return claims.role === 'authenticated' && typeof claims.sub === 'string'
  } catch {
    return false
  }
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!isSignedInUser(req)) return json({ error: 'Sign in to use this function' }, 401)

  const secret = Deno.env.get('TEST_SECRET') ?? ''
  return json({ found: secret.length > 0, length: secret.length })
})
