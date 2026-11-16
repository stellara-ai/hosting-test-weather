<script setup lang="ts">
import UnitToggle from '@/components/UnitToggle.vue'
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex w-full max-w-xl items-center justify-between gap-4 px-4 py-3">
      <nav class="flex items-center gap-4 text-sm font-medium" aria-label="Main">
        <RouterLink
          :to="{ name: 'home' }"
          class="py-2 text-slate-600 hover:text-slate-900"
          exact-active-class="text-sky-700"
        >
          Search
        </RouterLink>
        <RouterLink
          :to="{ name: 'saved' }"
          class="py-2 text-slate-600 hover:text-slate-900"
          active-class="text-sky-700"
        >
          Saved
        </RouterLink>
      </nav>
      <UnitToggle />
    </div>
  </header>
</template>
