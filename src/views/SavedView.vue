<script setup lang="ts">
import StatusMessage from '@/components/StatusMessage.vue'
import { usePreferencesStore } from '@/stores/preferences'

const preferences = usePreferencesStore()
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">Saved cities</h1>
    <StatusMessage v-if="preferences.savedCities.length === 0" tone="empty">
      No saved cities yet.
      <RouterLink :to="{ name: 'home' }" class="font-medium text-sky-700 underline">
        Search for one
      </RouterLink>
      and save it.
    </StatusMessage>
    <ul v-else class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      <li
        v-for="city in preferences.savedCities"
        :key="city"
        class="flex items-center justify-between gap-3 px-4 py-2"
      >
        <RouterLink
          :to="{ name: 'city', params: { name: city } }"
          class="min-w-0 flex-1 truncate py-2 font-medium text-sky-700 hover:underline"
        >
          {{ city }}
        </RouterLink>
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          :aria-label="`Remove ${city}`"
          @click="preferences.removeCity(city)"
        >
          Remove
        </button>
      </li>
    </ul>
  </section>
</template>
