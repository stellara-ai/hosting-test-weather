import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { backend, type AuthUser } from '@/services/backend'
import { useAuthStore } from '../auth'

vi.mock('@/services/backend', () => ({
  backend: {
    getUser: vi.fn(),
    onAuthChange: vi.fn(),
    requestCode: vi.fn(),
    verifyCode: vi.fn(),
    signOut: vi.fn(),
  },
}))

const mocked = vi.mocked(backend)
const ana: AuthUser = { id: 'user-1', email: 'ana@example.com' }

describe('auth store', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
  })

  it('restores a stored session on init', async () => {
    mocked.getUser.mockResolvedValue(ana)
    const store = useAuthStore()

    expect(store.ready).toBe(false)
    await store.init()

    expect(store.ready).toBe(true)
    expect(store.user).toEqual(ana)
    expect(store.isSignedIn).toBe(true)
  })

  it('initialises only once', async () => {
    mocked.getUser.mockResolvedValue(null)
    const store = useAuthStore()
    await Promise.all([store.init(), store.init()])
    expect(mocked.getUser).toHaveBeenCalledTimes(1)
  })

  it('is signed out but ready when the backend cannot be reached', async () => {
    mocked.getUser.mockRejectedValue(new Error('not configured'))
    const store = useAuthStore()
    await store.init()
    expect(store.ready).toBe(true)
    expect(store.isSignedIn).toBe(false)
  })

  it('follows sign-in and sign-out reported by the backend', async () => {
    mocked.getUser.mockResolvedValue(null)
    const store = useAuthStore()
    await store.init()

    const notify = mocked.onAuthChange.mock.calls[0]?.[0]
    notify?.(ana)
    expect(store.user).toEqual(ana)
    notify?.(null)
    expect(store.user).toBeNull()
  })

  it('trims the email and code, and signs in after verifying', async () => {
    mocked.verifyCode.mockResolvedValue(ana)
    const store = useAuthStore()

    await store.requestCode(' ana@example.com ')
    await store.verifyCode(' ana@example.com ', ' 123456 ')

    expect(mocked.requestCode).toHaveBeenCalledWith('ana@example.com')
    expect(mocked.verifyCode).toHaveBeenCalledWith('ana@example.com', '123456')
    expect(store.user).toEqual(ana)
  })

  it('stays signed out when the code is wrong', async () => {
    mocked.verifyCode.mockRejectedValue(new Error('Token has expired or is invalid'))
    const store = useAuthStore()
    await expect(store.verifyCode('ana@example.com', '000000')).rejects.toThrow()
    expect(store.isSignedIn).toBe(false)
  })

  it('clears the user on sign-out', async () => {
    mocked.getUser.mockResolvedValue(ana)
    const store = useAuthStore()
    await store.init()
    await store.signOut()
    expect(mocked.signOut).toHaveBeenCalled()
    expect(store.user).toBeNull()
  })
})
