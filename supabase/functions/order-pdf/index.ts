/**
 * Builds an invoice PDF for one order and returns a short-lived download link.
 * Signed-in callers only. Stage three, Part C (the PDF spike).
 *
 * Access is decided by row-level security, not by this code: the order, its
 * lines, the tenant's branding and the logo and signature files are all read
 * with the caller's own token, so a caller who is not a member of the order's
 * tenant gets "not found". Only the upload uses the secret key, because app
 * users have no write access to the tenant-documents bucket. The download link
 * is signed with the caller's token again.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import {
  buildInvoicePdf,
  type ImageBytes,
  readInvoiceOptions,
  TooManyLinesError,
} from '../_shared/invoicePdf.ts'

const ASSETS_BUCKET = 'tenant-assets'
const DOCUMENTS_BUCKET = 'tenant-documents'
const LINK_SECONDS = 300
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders })
}

/** Reads a named key from the JSON key sets Supabase provides, or a legacy key. */
function projectKey(setName: string, legacyName: string): string {
  const set = Deno.env.get(setName)
  if (set) {
    const key = JSON.parse(set).default
    if (typeof key === 'string' && key) return key
  }
  const legacy = Deno.env.get(legacyName)
  if (!legacy) throw new Error(`Missing ${setName}`)
  return legacy
}

interface OrderRow {
  id: string
  tenant_id: string
  number: string
  customer_name: string
  bill_to_address: string | null
  ship_to_name: string | null
  ship_to_address: string | null
  ordered_on: string
  shipped_on: string | null
  signature_path: string | null
  order_lines: {
    position: number
    item_code: string | null
    product: string
    unit: string
    quantity: number
    unit_price_cents: number
  }[]
  tenants: {
    name: string
    address: string | null
    email: string | null
    phone: string | null
    logo_path: string | null
    primary_color: string
    accent_color: string
    invoice_settings: unknown
  } | null
}

const ORDER_COLUMNS =
  'id, tenant_id, number, customer_name, bill_to_address, ship_to_name, ship_to_address, ' +
  'ordered_on, shipped_on, signature_path, ' +
  'order_lines (position, item_code, product, unit, quantity, unit_price_cents), ' +
  'tenants (name, address, email, phone, logo_path, primary_color, accent_color, invoice_settings)'

/** Downloads a PNG or JPG the caller may read, or null (missing, other type, refused). */
async function readImage(client: SupabaseClient, path: string | null): Promise<ImageBytes | null> {
  if (!path) return null
  const extension = path.split('.').pop()?.toLowerCase()
  const type = extension === 'png' ? 'png' : extension === 'jpg' || extension === 'jpeg' ? 'jpg' : null
  if (!type) return null
  const { data, error } = await client.storage.from(ASSETS_BUCKET).download(path)
  if (error || !data) return null
  return { bytes: new Uint8Array(await data.arrayBuffer()), type }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const started = performance.now()
  const url = Deno.env.get('SUPABASE_URL')!
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''

  // The caller's client: everything it reads goes through row-level security.
  const asCaller = createClient(url, projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await asCaller.auth.getClaims(token)
  if (authError || auth?.claims.role !== 'authenticated' || !auth.claims.sub) {
    return json({ error: 'Sign in to use this function' }, 401)
  }

  let orderId: unknown
  try {
    orderId = (await req.json()).orderId
  } catch {
    return json({ error: 'Send JSON with an orderId' }, 400)
  }
  if (typeof orderId !== 'string' || !UUID.test(orderId)) {
    return json({ error: 'orderId must be a UUID' }, 400)
  }

  const { data, error } = await asCaller.from('orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle()
  if (error) {
    console.error('order-pdf: order query failed', error.code)
    return json({ error: 'The order could not be loaded' }, 500)
  }
  const order = data as unknown as OrderRow | null
  if (!order?.tenants) return json({ error: 'Order not found' }, 404)

  const [logo, signature] = await Promise.all([
    readImage(asCaller, order.tenants.logo_path),
    readImage(asCaller, order.signature_path),
  ])

  const buildStarted = performance.now()
  let pdf: Uint8Array
  try {
    pdf = await buildInvoicePdf({
      options: readInvoiceOptions(order.tenants.invoice_settings),
      business: {
        name: order.tenants.name,
        address: order.tenants.address ?? '',
        email: order.tenants.email ?? '',
        phone: order.tenants.phone ?? '',
        primaryColor: order.tenants.primary_color,
        accentColor: order.tenants.accent_color,
      },
      invoiceNumber: order.number,
      invoiceDate: order.ordered_on,
      shipDate: order.shipped_on,
      billTo: { name: order.customer_name, address: order.bill_to_address ?? '' },
      shipTo: {
        name: order.ship_to_name ?? order.customer_name,
        address: order.ship_to_address ?? order.bill_to_address ?? '',
      },
      lines: [...order.order_lines]
        .sort((a, b) => a.position - b.position)
        .map((line) => ({
          itemCode: line.item_code ?? '',
          description: line.product,
          unit: line.unit,
          quantity: line.quantity,
          unitPriceCents: line.unit_price_cents,
        })),
      logo,
      signature,
      generatedAt: new Date(),
    })
  } catch (error) {
    if (error instanceof TooManyLinesError) return json({ error: error.message }, 422)
    throw error
  }
  const buildMs = Math.round(performance.now() - buildStarted)

  const path = `${order.tenant_id}/invoices/order-${order.number.replace(/[^A-Za-z0-9-]/g, '_')}.pdf`
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const upload = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
  if (upload.error) {
    console.error('order-pdf: upload failed', upload.error.message)
    return json({ error: 'The PDF could not be stored' }, 500)
  }

  // Signed as the caller, so the documents bucket's read policy is exercised too.
  const signed = await asCaller.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, LINK_SECONDS, { download: `invoice-${order.number}.pdf` })
  if (signed.error || !signed.data) {
    console.error('order-pdf: signing failed', signed.error?.message)
    return json({ error: 'The download link could not be created' }, 500)
  }

  const heapMb = Math.round(Deno.memoryUsage().heapUsed / 1e6)
  const totalMs = Math.round(performance.now() - started)
  console.log('order-pdf: built', JSON.stringify({ bytes: pdf.length, buildMs, totalMs, heapMb }))

  return json({
    url: signed.data.signedUrl,
    expiresInSeconds: LINK_SECONDS,
    measurements: { bytes: pdf.length, buildMs, totalMs, heapMb },
  })
})
