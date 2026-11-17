<script setup lang="ts">
import type { Unit } from '@/services/weather'
import { usePreferencesStore } from '@/stores/preferences'

const preferences = usePreferencesStore()

const options: { value: Unit; label: string; name: string }[] = [
  { value: 'fahrenheit', label: '°F', name: 'Fahrenheit' },
  { value: 'celsius', label: '°C', name: 'Celsius' },
]
</script>

<template>
  <div class="flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label="Temperature unit">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="min-w-11 px-3 py-2 text-sm font-medium"
      :class="
        preferences.unit === option.value
          ? 'bg-brand text-white'
          : 'bg-white text-slate-600 hover:bg-slate-100'
      "
      :aria-pressed="preferences.unit === option.value"
      :aria-label="option.name"
      @click="preferences.setUnit(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
