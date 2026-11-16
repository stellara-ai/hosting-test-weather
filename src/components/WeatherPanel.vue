<script setup lang="ts">
import SaveCityButton from '@/components/SaveCityButton.vue'
import StatusMessage from '@/components/StatusMessage.vue'
import WeatherCard from '@/components/WeatherCard.vue'
import type { WeatherStatus } from '@/composables/useWeather'
import type { Weather } from '@/services/weather'

defineProps<{
  status: WeatherStatus
  weather: Weather | null
  errorMessage: string
  city: string
}>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <StatusMessage v-if="status === 'idle'" tone="empty">
    Search for a city to see its weather.
  </StatusMessage>
  <StatusMessage v-else-if="status === 'loading'" tone="loading">
    Loading weather for {{ city }}…
  </StatusMessage>
  <StatusMessage v-else-if="status === 'not-found'" tone="empty">
    No city matched “{{ city }}”. Check the spelling and try again.
  </StatusMessage>
  <StatusMessage v-else-if="status === 'error'" tone="error" @retry="$emit('retry')">
    {{ errorMessage }}
  </StatusMessage>
  <div v-else-if="weather" class="space-y-3">
    <WeatherCard :weather="weather" />
    <div class="flex flex-wrap items-center gap-3">
      <SaveCityButton :city="weather.place.name" />
      <slot name="actions" :weather="weather" />
    </div>
  </div>
</template>
