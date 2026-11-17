<script setup lang="ts">
import { useRouter } from 'vue-router'

import NotesPanel from '@/components/NotesPanel.vue'
import OrdersPanel from '@/components/OrdersPanel.vue'
import SecretCheckPanel from '@/components/SecretCheckPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useTenantStore } from '@/stores/tenant'

const auth = useAuthStore()
const tenant = useTenantStore()
const router = useRouter()

async function signOut() {
  await auth.signOut()
  router.replace({ name: 'sign-in' })
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold">Account</h1>
        <p class="truncate text-sm text-slate-600">Signed in as {{ auth.user?.email }}</p>
        <p class="truncate text-sm text-slate-600" data-testid="tenant-line">
          <template v-if="tenant.tenant">
            Business: <span class="font-medium text-slate-900">{{ tenant.tenant.name }}</span>
            ({{ tenant.tenant.role }})
          </template>
          <template v-else-if="tenant.status === 'ready'">
            No business is linked to this account.
          </template>
          <template v-else-if="tenant.status === 'error'">
            Your business could not be loaded.
          </template>
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        @click="signOut"
      >
        Sign out
      </button>
    </div>
    <OrdersPanel v-if="tenant.tenant" />
    <SecretCheckPanel />
    <NotesPanel />
  </section>
</template>
