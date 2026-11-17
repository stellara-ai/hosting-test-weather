import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { backend, type Tenant } from '@/services/backend'
import { useTenantStore } from '../tenant'

vi.mock('@/services/backend', () => ({
  backend: { getTenant: vi.fn() },
}))

const mocked = vi.mocked(backend)
const lamo: Tenant = {
  id: 'tenant-1',
  slug: 'lamo',
  name: 'LAMO Distributor',
  role: 'admin',
  primaryColor: '#166534',
  accentColor: '#9a3412',
  logoUrl: 'https://files.test/logo.svg',
}

describe('tenant store', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
  })

  it('loads the tenant and exposes its colours as CSS variables', async () => {
    mocked.getTenant.mockResolvedValue(lamo)
    const store = useTenantStore()

    await store.load()

    expect(store.status).toBe('ready')
    expect(store.tenant).toEqual(lamo)
    expect(store.brandStyle).toEqual({ '--brand-primary': '#166534', '--brand-accent': '#9a3412' })
  })

  it('has no tenant and no brand colours for a user without a membership', async () => {
    mocked.getTenant.mockResolvedValue(null)
    const store = useTenantStore()

    await store.load()

    expect(store.status).toBe('ready')
    expect(store.tenant).toBeNull()
    expect(store.brandStyle).toEqual({})
  })

  it('ignores a colour that is not a plain hex value', async () => {
    mocked.getTenant.mockResolvedValue({
      ...lamo,
      primaryColor: 'red; background: url(https://evil.test)',
    })
    const store = useTenantStore()

    await store.load()

    expect(store.brandStyle).toEqual({ '--brand-accent': '#9a3412' })
  })

  it('reports an error and keeps no tenant when loading fails', async () => {
    mocked.getTenant.mockRejectedValue(new Error('network'))
    const store = useTenantStore()

    await store.load()

    expect(store.status).toBe('error')
    expect(store.tenant).toBeNull()
  })

  it('drops a load that finishes after the tenant was cleared', async () => {
    let finish: (tenant: Tenant) => void = () => {}
    mocked.getTenant.mockReturnValue(new Promise<Tenant>((resolve) => (finish = resolve)))
    const store = useTenantStore()

    const loading = store.load()
    store.clear()
    finish(lamo)
    await loading

    expect(store.tenant).toBeNull()
    expect(store.status).toBe('idle')
  })
})
