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
    const { error } = await getClient().auth.signInWithOtp({ email })
    if (!error) return
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
}
