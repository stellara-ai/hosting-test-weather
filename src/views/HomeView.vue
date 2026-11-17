<script setup lang="ts">
import { ref } from 'vue'

import CitySearchForm from '@/components/CitySearchForm.vue'
import WeatherPanel from '@/components/WeatherPanel.vue'
import { useWeather } from '@/composables/useWeather'
import { usePreferencesStore } from '@/stores/preferences'

const preferences = usePreferencesStore()
const city = ref('')
const { status, weather, errorMessage, reload } = useWeather(city, () => preferences.unit)

function search(name: string) {
  if (name === city.value) reload()
  else city.value = name
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">Weather lookup</h1>
    <CitySearchForm @search="search" />
    <WeatherPanel
      :status="status"
      :weather="weather"
      :error-message="errorMessage"
      :city="city"
      @retry="reload"
    >
      <template #actions="{ weather: result }">
        <RouterLink
          :to="{ name: 'city', params: { name: result.place.name } }"
          class="py-2 text-sm font-medium text-accent underline hover:brightness-75"
        >
          Open city page
        </RouterLink>
      </template>
    </WeatherPanel>
  </section>
</template>
