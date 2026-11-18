/**
 * The tool catalog: every action the app exposes, declared once.
 *
 * Each tool says what it is called, what it does, what input it takes, whether
 * it reads or writes, whether a person must confirm it, which roles may use
 * it, and which channels offer it (screens, the in-app assistant, MCP). The
 * MCP server's tool list is generated from this file; no channel keeps its
 * own hand-written list. Stage three, Part F (the MCP spike).
 *
 * Tools run as the signed-in user, with that user's own database client, so
 * row-level security decides what they can see. A tool can never do more than
 * the user could do in the app.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4.6.7'

export type Channel = 'screen' | 'assistant' | 'mcp'
export type Role = 'admin' | 'member'

export interface ToolContext {
  /** A database client carrying the caller's own token. */
  db: SupabaseClient
  userId: string
}

export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  /** Stable name, as agents see it: lower case with underscores. */
  name: string
  title: string
  /** Written for the AI model: what the tool does and when to use it. */
  description: string
  input: Shape
  access: 'read' | 'write'
  /** Writes proposed by an AI wait for a person's confirmation ("AI proposes, code commits"). */
  needsConfirmation: boolean
  roles: Role[]
  channels: Channel[]
  run: (ctx: ToolContext, input: z.infer<z.ZodObject<Shape>>) => Promise<unknown>
}

/** Thrown for a refusal the caller should see as a plain message. */
export class ToolRefusal extends Error {
  override name = 'ToolRefusal'
}

function defineTool<Shape extends z.ZodRawShape>(tool: ToolDefinition<Shape>): ToolDefinition<Shape> {
  return tool
}

/** The caller's roles across their businesses (row-level security returns only their own). */
async function callerRoles(ctx: ToolContext): Promise<Role[]> {
  const { data, error } = await ctx.db.from('memberships').select('role').eq('user_id', ctx.userId)
  if (error) throw new Error('Could not check your access')
  return (data ?? []).map((row) => row.role as Role)
}

/** Runs a tool after validating its input and checking the caller's role. */
export async function runTool(tool: ToolDefinition, ctx: ToolContext, rawInput: unknown): Promise<unknown> {
  const input = z.object(tool.input).parse(rawInput ?? {})
  const roles = await callerRoles(ctx)
  if (!roles.some((role) => tool.roles.includes(role))) {
    throw new ToolRefusal('No business is linked to this account, so there is nothing to show.')
  }
  return tool.run(ctx, input)
}

interface OrderRow {
  number: string
  customer_name: string
  ordered_on: string
  shipped_on: string | null
  signature_path: string | null
  order_lines: { quantity: number; unit_price_cents: number }[]
}

export const listOrders = defineTool({
  name: 'list_orders',
  title: 'List orders',
  description:
    "Lists the orders of the signed-in user's business, newest first: order number, customer, " +
    'order and ship dates, number of lines, total in US dollars, and whether delivery was signed. ' +
    'Read-only. Prices and totals come from the database; do not estimate them.',
  input: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('How many orders to return, newest first. Default 20.'),
  },
  access: 'read',
  needsConfirmation: false,
  roles: ['admin', 'member'],
  // The test app's Orders list still queries directly; in the product the
  // screens call the catalog too (principle 1), and this would add 'screen'.
  channels: ['mcp'],
  async run({ db }, { limit }) {
    const { data, error } = await db
      .from('orders')
      .select('number, customer_name, ordered_on, shipped_on, signature_path, order_lines (quantity, unit_price_cents)')
      .order('ordered_on', { ascending: false })
      .order('number', { ascending: false })
      .limit(limit ?? 20)
    if (error) throw new Error('Could not load orders')
    return (data as unknown as OrderRow[]).map((order) => {
      const totalCents = order.order_lines.reduce((sum, line) => sum + line.quantity * line.unit_price_cents, 0)
      return {
        orderNumber: order.number,
        customer: order.customer_name,
        orderedOn: order.ordered_on,
        shippedOn: order.shipped_on,
        lineCount: order.order_lines.length,
        total: (totalCents / 100).toFixed(2),
        currency: 'USD',
        deliverySigned: order.signature_path !== null,
      }
    })
  },
})

/** Every tool, in the order agents see them. */
export const TOOL_CATALOG: ToolDefinition[] = [listOrders as unknown as ToolDefinition]

/**
 * The tools offered over MCP. Write tools are held back until the product
 * builds confirmation over MCP: an outside agent may only propose a change,
 * and a person confirms it in the app.
 */
export function mcpTools(): ToolDefinition[] {
  return TOOL_CATALOG.filter((tool) => tool.channels.includes('mcp') && tool.access === 'read')
}
