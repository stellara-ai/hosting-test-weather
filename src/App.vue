<script setup lang="ts">
import { watch } from 'vue'

import AppFooter from '@/components/AppFooter.vue'
import AppHeader from '@/components/AppHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { useTenantStore } from '@/stores/tenant'

const auth = useAuthStore()
const tenant = useTenantStore()

// The business and its branding follow the signed-in user.
watch(
  () => auth.user?.id,
  (userId) => {
    if (userId) void tenant.load()
    else tenant.clear()
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-slate-50 text-slate-900" :style="tenant.brandStyle">
    <AppHeader />
    <main class="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
