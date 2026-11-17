<script setup lang="ts">
import { ref, watch } from 'vue'

import UnitToggle from '@/components/UnitToggle.vue'
import { useTenantStore } from '@/stores/tenant'

const tenant = useTenantStore()

// If the logo cannot be shown (for example its link has expired), fall back
// to the business name.
const logoFailed = ref(false)
watch(
  () => tenant.tenant?.logoUrl,
  () => {
    logoFailed.value = false
  },
)
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div
      v-if="tenant.tenant"
      class="mx-auto flex w-full max-w-xl items-center px-4 pt-3"
      data-testid="tenant-brand"
    >
      <img
        v-if="tenant.tenant.logoUrl && !logoFailed"
        :src="tenant.tenant.logoUrl"
        :alt="tenant.tenant.name"
        class="h-8 w-auto"
        @error="logoFailed = true"
      />
      <span v-else class="text-base font-semibold text-brand">{{ tenant.tenant.name }}</span>
    </div>
    <div class="mx-auto flex w-full max-w-xl items-center justify-between gap-4 px-4 py-3">
      <nav class="flex items-center gap-4 text-sm font-medium" aria-label="Main">
        <RouterLink
          :to="{ name: 'home' }"
          class="py-2 text-slate-600 hover:text-slate-900"
          exact-active-class="text-accent"
        >
          Search
        </RouterLink>
        <RouterLink
          :to="{ name: 'saved' }"
          class="py-2 text-slate-600 hover:text-slate-900"
          active-class="text-accent"
        >
          Saved
        </RouterLink>
        <RouterLink
          :to="{ name: 'account' }"
          class="py-2 text-slate-600 hover:text-slate-900"
          active-class="text-accent"
        >
          Account
        </RouterLink>
      </nav>
      <UnitToggle />
    </div>
  </header>
</template>
