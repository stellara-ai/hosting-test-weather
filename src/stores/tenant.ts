import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { backend, type Tenant } from '@/services/backend'

export type TenantStatus = 'idle' | 'loading' | 'ready' | 'error'

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/

/** The signed-in user's business and its branding. */
export const useTenantStore = defineStore('tenant', () => {
  const tenant = ref<Tenant | null>(null)
  const status = ref<TenantStatus>('idle')

  // Guards against a slow load finishing after the user has signed out.
  let latest = 0

  async function load() {
    const request = ++latest
    status.value = 'loading'
    try {
      const found = await backend.getTenant()
      if (request !== latest) return
      tenant.value = found
      status.value = 'ready'
    } catch {
      if (request !== latest) return
      tenant.value = null
      status.value = 'error'
    }
  }

  function clear() {
    latest++
    tenant.value = null
    status.value = 'idle'
  }

  /**
   * CSS variables that override the default brand colours. A value that is
   * not a plain hex colour is ignored, so nothing from the database is ever
   * placed into a style unchecked.
   */
  const brandStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {}
    if (!tenant.value) return style
    if (HEX_COLOUR.test(tenant.value.primaryColor)) {
      style['--brand-primary'] = tenant.value.primaryColor
    }
    if (HEX_COLOUR.test(tenant.value.accentColor)) {
      style['--brand-accent'] = tenant.value.accentColor
    }
    return style
  })

  return { tenant, status, brandStyle, load, clear }
})
