<script setup lang="ts">
import WeatherPanel from '@/components/WeatherPanel.vue'
import { useWeather } from '@/composables/useWeather'
import { usePreferencesStore } from '@/stores/preferences'

const props = defineProps<{ name: string }>()

const preferences = usePreferencesStore()
const { status, weather, errorMessage, reload } = useWeather(
  () => props.name,
  () => preferences.unit,
)
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">City weather</h1>
    <WeatherPanel
      :status="status"
      :weather="weather"
      :error-message="errorMessage"
      :city="name"
      @retry="reload"
    />
  </section>
</template>
