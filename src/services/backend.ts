/**
 * The only module that talks to the backend (currently Supabase). The rest of
 * the app depends on the `Backend` interface and the types below.
 *
 * Only the project URL and the publishable key are used here. Both are public
 * build-time values; access to data is decided by row-level security.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
}

export interface Note {
  id: string
  body: string
  createdAt: string
}

export interface SecretCheck {
  found: boolean
  length: number
}

export interface Tenant {
  id: string
  slug: string
  name: string
  role: 'admin' | 'member' | 'driver'
  primaryColor: string
  accentColor: string
  /** A short-lived link to the logo or word mark, or null when there is none. */
  logoUrl: string | null
}

export interface OrderSummary {
  id: string
  number: string
  customerName: string
  orderedOn: string
  totalCents: number
  status: OrderStatus
}

export type OrderStatus = 'draft' | 'issued' | 'delivered' | 'paid' | 'void'

export interface DeliveryLine {
  id: string
  itemCode: string
  description: string
  unit: string
  quantity: number
  unitPriceCents: number
}

export interface ApprovedSigner {
  id: string
  name: string
  addedAtDelivery: boolean
}

/** An order as the delivery screen needs it. */
export interface DeliveryOrder {
  id: string
  tenantId: string
  number: string
  customerName: string
  shipToName: string
  shipToAddress: string
  status: OrderStatus
  lines: DeliveryLine[]
  signers: ApprovedSigner[]
  /** The recorded delivery, or null when not delivered yet. */
  delivery: { outcome: DeliveryOutcome; signerName: string | null; recordedAt: string } | null
}

/**
 * all_received: everything arrived. exceptions: some lines short, damaged or
 * refused. not_checked: signed as received without checking. signed_on_paper:
 * the customer signed the printed copy.
 */
export type DeliveryOutcome = 'all_received' | 'exceptions' | 'not_checked' | 'signed_on_paper'
export type CheckMode = 'skipped' | 'one_by_one' | 'select_all'
export type LineProblem = 'short' | 'damaged' | 'refused'

export interface LineException {
  orderLineId: string
  status: LineProblem
  /** For short lines: how many arrived. */
  deliveredQuantity: number
  reason: string
}

export interface DeliveryInput {
  order: Pick<DeliveryOrder, 'id' | 'tenantId'>
  outcome: DeliveryOutcome
  checkMode: CheckMode | null
  exceptions: LineException[]
  /** An approved signer, or a new name to add to the customer's list. */
  signer: { id: string } | { newName: string } | null
  signature: Blob | null
  photo: File | null
  /** For deliveries with problems: issue a credit memo now (the default), or skip it with a reason. */
  issueCredit: boolean
  noCreditReason: string
}

export interface DeliveryResult {
  outcome: DeliveryOutcome
  signerName: string | null
  creditMemoNumber: string | null
  creditMemoCents: number
  /** Problems were recorded but no credit memo was issued. */
  creditSkipped: boolean
  noCreditReason: string | null
  /** The value of the problem lines, whether or not it was credited. */
  missingCents: number
}

export interface OfficeAlert {
  id: string
  kind: 'new_signer' | 'not_checked' | 'exceptions'
  message: string
  createdAt: string
}

export interface OrderPdfLink {
  url: string
  /** What the server measured while building the PDF, for the spike's records. */
  measurements: { bytes: number; buildMs: number; totalMs: number; heapMb: number }
}

/** An outside app (for example an AI agent) asking to act as the signed-in user. */
export interface AuthorizationRequest {
  id: string
  clientName: string
  clientUri: string
  redirectUri: string
  scopes: string[]
}

export interface Backend {
  /** The signed-in user restored from the stored session, or null. */
  getUser(): Promise<AuthUser | null>
  /** Calls back on sign-in and sign-out. Returns a function that stops listening. */
  onAuthChange(callback: (user: AuthUser | null) => void): () => void
  requestCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<AuthUser>
  signOut(): Promise<void>
  listNotes(): Promise<Note[]>
  addNote(body: string): Promise<Note>
  deleteNote(id: string): Promise<void>
  checkSecret(): Promise<SecretCheck>
  /** The business the signed-in user belongs to, or null when they belong to none. */
  getTenant(): Promise<Tenant | null>
  /** The orders of the signed-in user's business, newest first. */
  listOrders(): Promise<OrderSummary[]>
  /** Builds the invoice PDF for an order and returns a short-lived download link. */
  getOrderPdfLink(orderId: string): Promise<OrderPdfLink>
  /**
   * Details of a pending sign-in request from an outside app, or the address
   * to return to when the user already approved this app.
   */
  getAuthorizationRequest(id: string): Promise<AuthorizationRequest | { redirectUrl: string }>
  /** Approves or refuses the request; returns the address to send the user back to. */
  decideAuthorization(id: string, approve: boolean): Promise<string>
  /** An order with its lines, the customer's approved signers and any recorded delivery. */
  getDeliveryOrder(orderId: string): Promise<DeliveryOrder>
  /** Uploads the signature and photo from this device, then records the delivery in one step. */
  recordDelivery(input: DeliveryInput): Promise<DeliveryResult>
  /** Open alerts for the office, newest first. */
  listOfficeAlerts(): Promise<OfficeAlert[]>
  /** Marks an alert as handled (admins only). */
  resolveOfficeAlert(id: string): Promise<void>
}

export class BackendError extends Error {
  override name = 'BackendError'
}

const NOTE_COLUMNS = 'id, body, created_at'

interface NoteRow {
  id: string
  body: string
  created_at: string
}

const TENANT_COLUMNS =
  'role, tenants (id, slug, name, logo_path, primary_color, accent_color)'
const TENANT_FILES_BUCKET = 'tenant-assets'
const LOGO_LINK_SECONDS = 3600

interface MembershipRow {
  role: 'admin' | 'member' | 'driver'
  tenants: {
    id: string
    slug: string
    name: string
    logo_path: string | null
    primary_color: string
    accent_color: string
  } | null
}

const ORDER_COLUMNS =
  'id, number, customer_name, ordered_on, status, order_lines (quantity, unit_price_cents)'

interface OrderRow {
  id: string
  number: string
  customer_name: string
  ordered_on: string
  status: OrderStatus
  order_lines: { quantity: number; unit_price_cents: number }[]
}

const DELIVERY_ORDER_COLUMNS =
  'id, tenant_id, number, customer_name, ship_to_name, ship_to_address, status, ' +
  'order_lines (id, position, item_code, product, unit, quantity, unit_price_cents), ' +
  'customers (customer_signers (id, name, added_at_delivery)), ' +
  'deliveries (outcome, signer_name, recorded_at)'

interface DeliveryOrderRow {
  id: string
  tenant_id: string
  number: string
  customer_name: string
  ship_to_name: string | null
  ship_to_address: string | null
  status: OrderStatus
  order_lines: {
    id: string
    position: number
    item_code: string | null
    product: string
    unit: string
    quantity: number
    unit_price_cents: number
  }[]
  customers: { customer_signers: { id: string; name: string; added_at_delivery: boolean }[] } | null
  deliveries: { outcome: DeliveryOutcome; signer_name: string | null; recorded_at: string }[] | {
    outcome: DeliveryOutcome
    signer_name: string | null
    recorded_at: string
  } | null
}

export function toDeliveryOrder(row: DeliveryOrderRow): DeliveryOrder {
  const delivery = Array.isArray(row.deliveries) ? (row.deliveries[0] ?? null) : row.deliveries
  return {
    id: row.id,
    tenantId: row.tenant_id,
    number: row.number,
    customerName: row.customer_name,
    shipToName: row.ship_to_name ?? row.customer_name,
    shipToAddress: row.ship_to_address ?? '',
    status: row.status,
    lines: [...row.order_lines]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({
        id: line.id,
        itemCode: line.item_code ?? '',
        description: line.product,
        unit: line.unit,
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
      })),
    signers: [...(row.customers?.customer_signers ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((signer) => ({ id: signer.id, name: signer.name, addedAtDelivery: signer.added_at_delivery })),
    delivery: delivery
      ? { outcome: delivery.outcome, signerName: delivery.signer_name, recordedAt: delivery.recorded_at }
      : null,
  }
}

const PROOFS_BUCKET = 'delivery-proofs'

const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

/**
 * A random file id. crypto.randomUUID() exists only on secure pages (https or
 * localhost), so a phone testing over plain http on the local network lacks
 * it; crypto.getRandomValues() works everywhere.
 */
export function randomId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Uploads one file into the business's folder for this order; returns its path. */
async function uploadProof(order: { id: string; tenantId: string }, name: string, file: Blob): Promise<string> {
  const path = `${order.tenantId}/${order.id}/${name}-${randomId()}.${PHOTO_EXTENSIONS[file.type] ?? 'png'}`
  const { error } = await getClient().storage.from(PROOFS_BUCKET).upload(path, file, {
    contentType: file.type || 'image/png',
    upsert: false,
  })
  if (error) throw new BackendError(`The ${name} could not be uploaded. Check the connection and try again.`)
  return path
}

export function toOrderSummary(row: OrderRow): OrderSummary {
  return {
    id: row.id,
    number: row.number,
    customerName: row.customer_name,
    orderedOn: row.ordered_on,
    totalCents: row.order_lines.reduce((sum, line) => sum + line.quantity * line.unit_price_cents, 0),
    status: row.status,
  }
}

/**
 * True when Supabase refused a code request because the address has no
 * account. Accounts are created by invitation only, so the sign-in form
 * treats this like a success and gives the same answer for every address.
 */
export function isUnknownAddressError(error: { code?: string }): boolean {
  // otp_disabled: asked with account creation off and no account exists.
  // signup_disabled: the project has sign-ups turned off.
  return error.code === 'otp_disabled' || error.code === 'signup_disabled'
}

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new BackendError(
      'Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild.',
    )
  }
  client = createClient(url, key)
  return client
}

function toNote(row: NoteRow): Note {
  return { id: row.id, body: row.body, createdAt: row.created_at }
}

export const backend: Backend = {
  async getUser() {
    const { data, error } = await getClient().auth.getClaims()
    if (error || !data) return null
    return { id: data.claims.sub, email: data.claims.email ?? '' }
  },

  onAuthChange(callback) {
    const { data } = getClient().auth.onAuthStateChange((_event, session) => {
      callback(session ? { id: session.user.id, email: session.user.email ?? '' } : null)
    })
    return () => data.subscription.unsubscribe()
  },

  async requestCode(email) {
    const { error } = await getClient().auth.signInWithOtp({
      email,
      // Invite-only: never create an account from the sign-in form.
      options: { shouldCreateUser: false },
    })
    if (!error || isUnknownAddressError(error)) return
    // A failure in the Send Email hook surfaces as a 5xx with Supabase's
    // internal wording, which means nothing to the person signing in.
    const emailFailed = typeof error.status === 'number' && error.status >= 500
    throw new BackendError(
      emailFailed
        ? 'We could not send the sign-in email. Please try again in a moment.'
        : error.message,
    )
  },

  async verifyCode(email, code) {
    const { data, error } = await getClient().auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) throw new BackendError(error.message)
    if (!data.user) throw new BackendError('Sign-in did not return a user.')
    return { id: data.user.id, email: data.user.email ?? email }
  },

  async signOut() {
    const { error } = await getClient().auth.signOut()
    if (error) throw new BackendError(error.message)
  },

  async listNotes() {
    const { data, error } = await getClient()
      .from('notes')
      .select(NOTE_COLUMNS)
      .order('created_at', { ascending: false })
    if (error) throw new BackendError(error.message)
    return (data as NoteRow[]).map(toNote)
  },

  async addNote(body) {
    const { data, error } = await getClient()
      .from('notes')
      .insert({ body })
      .select(NOTE_COLUMNS)
      .single()
    if (error) throw new BackendError(error.message)
    return toNote(data as NoteRow)
  },

  async deleteNote(id) {
    const { error } = await getClient().from('notes').delete().eq('id', id)
    if (error) throw new BackendError(error.message)
  },

  async checkSecret() {
    const { data, error } = await getClient().functions.invoke<SecretCheck>('secret-check')
    if (error || !data) {
      throw new BackendError('The secret check was refused or could not be reached.')
    }
    return { found: data.found, length: data.length }
  },

  async getTenant() {
    // Row-level security returns only the caller's own memberships. A user
    // in several businesses gets the first one; the product will pick the
    // business from the subdomain instead.
    const { data, error } = await getClient()
      .from('memberships')
      .select(TENANT_COLUMNS)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) throw new BackendError(error.message)
    const row = data as unknown as MembershipRow | null
    if (!row?.tenants) return null

    let logoUrl: string | null = null
    if (row.tenants.logo_path) {
      const signed = await getClient()
        .storage.from(TENANT_FILES_BUCKET)
        .createSignedUrl(row.tenants.logo_path, LOGO_LINK_SECONDS)
      logoUrl = signed.data?.signedUrl ?? null
    }
    return {
      id: row.tenants.id,
      slug: row.tenants.slug,
      name: row.tenants.name,
      role: row.role,
      primaryColor: row.tenants.primary_color,
      accentColor: row.tenants.accent_color,
      logoUrl,
    }
  },

  async listOrders() {
    // Row-level security returns only the orders of the caller's businesses.
    const { data, error } = await getClient()
      .from('orders')
      .select(ORDER_COLUMNS)
      .order('ordered_on', { ascending: false })
      .order('number', { ascending: false })
    if (error) throw new BackendError(error.message)
    return (data as unknown as OrderRow[]).map(toOrderSummary)
  },

  async getOrderPdfLink(orderId) {
    const { data, error } = await getClient().functions.invoke<OrderPdfLink>('order-pdf', {
      body: { orderId },
    })
    if (error || !data?.url) throw new BackendError('The invoice PDF could not be created.')
    return { url: data.url, measurements: data.measurements }
  },

  async getAuthorizationRequest(id) {
    const { data, error } = await getClient().auth.oauth.getAuthorizationDetails(id)
    if (error || !data) throw new BackendError(error?.message ?? 'This request could not be found.')
    if (!('authorization_id' in data)) return { redirectUrl: data.redirect_url }
    return {
      id: data.authorization_id,
      clientName: data.client.name,
      clientUri: data.client.uri,
      redirectUri: data.redirect_uri,
      scopes: data.scope.split(' ').filter(Boolean),
    }
  },

  async decideAuthorization(id, approve) {
    const oauth = getClient().auth.oauth
    const { data, error } = approve
      ? await oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await oauth.denyAuthorization(id, { skipBrowserRedirect: true })
    if (error || !data) throw new BackendError(error?.message ?? 'Your answer could not be saved.')
    return data.redirect_url
  },

  async getDeliveryOrder(orderId) {
    const { data, error } = await getClient()
      .from('orders')
      .select(DELIVERY_ORDER_COLUMNS)
      .eq('id', orderId)
      .maybeSingle()
    if (error) throw new BackendError(error.message)
    if (!data) throw new BackendError('Order not found.')
    return toDeliveryOrder(data as unknown as DeliveryOrderRow)
  },

  async recordDelivery(input) {
    const signaturePath = input.signature ? await uploadProof(input.order, 'signature', input.signature) : null
    const photoPath = input.photo ? await uploadProof(input.order, 'photo', input.photo) : null
    const { data, error } = await getClient().rpc('record_delivery', {
      p_order_id: input.order.id,
      p_outcome: input.outcome,
      p_check_mode: input.checkMode,
      p_lines: input.exceptions.map((line) => ({
        order_line_id: line.orderLineId,
        status: line.status,
        delivered_quantity: line.deliveredQuantity,
        reason: line.reason,
      })),
      p_signer_id: input.signer && 'id' in input.signer ? input.signer.id : null,
      p_new_signer_name: input.signer && 'newName' in input.signer ? input.signer.newName : null,
      p_signature_path: signaturePath,
      p_photo_path: photoPath,
      p_issue_credit: input.issueCredit,
      p_no_credit_reason: input.issueCredit ? null : input.noCreditReason.trim() || null,
    })
    if (error) throw new BackendError(error.message)
    const result = data as {
      outcome: DeliveryOutcome
      signer_name: string | null
      credit_memo_number: string | null
      credit_memo_cents: number
      credit_skipped: boolean
      no_credit_reason: string | null
      missing_cents: number
    }
    return {
      outcome: result.outcome,
      signerName: result.signer_name,
      creditMemoNumber: result.credit_memo_number,
      creditMemoCents: result.credit_memo_cents,
      creditSkipped: result.credit_skipped,
      noCreditReason: result.no_credit_reason,
      missingCents: result.missing_cents,
    }
  },

  async listOfficeAlerts() {
    const { data, error } = await getClient()
      .from('office_alerts')
      .select('id, kind, message, created_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
    if (error) throw new BackendError(error.message)
    return (data as { id: string; kind: OfficeAlert['kind']; message: string; created_at: string }[]).map(
      (row) => ({ id: row.id, kind: row.kind, message: row.message, createdAt: row.created_at }),
    )
  },

  async resolveOfficeAlert(id) {
    const { error } = await getClient().rpc('resolve_office_alert', { p_alert_id: id })
    if (error) throw new BackendError(error.message)
  },
}
