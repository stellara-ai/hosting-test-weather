<script setup lang="ts">
import type { Weather } from '@/services/weather'
import { formatPlace, formatTemperature, formatWeekday } from '@/utils/format'

defineProps<{ weather: Weather }>()
</script>

<template>
  <article class="rounded-xl border border-slate-200 bg-white">
    <div class="p-4">
      <h2 class="text-lg font-semibold">{{ formatPlace(weather.place) }}</h2>
      <div class="mt-3 flex items-end justify-between gap-4">
        <p class="text-5xl font-semibold tabular-nums">
          {{ formatTemperature(weather.current.temperature)
          }}<span class="text-2xl text-slate-500">{{ weather.unit === 'fahrenheit' ? 'F' : 'C' }}</span>
        </p>
        <p class="text-right text-slate-700">{{ weather.current.condition }}</p>
      </div>
      <dl class="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt class="text-slate-500">Feels like</dt>
          <dd class="font-medium tabular-nums">{{ formatTemperature(weather.current.feelsLike) }}</dd>
        </div>
        <div>
          <dt class="text-slate-500">Humidity</dt>
          <dd class="font-medium tabular-nums">{{ Math.round(weather.current.humidity) }}%</dd>
        </div>
        <div>
          <dt class="text-slate-500">Wind</dt>
          <dd class="font-medium tabular-nums">
            {{ Math.round(weather.current.windSpeed) }} {{ weather.windUnit }}
          </dd>
        </div>
      </dl>
    </div>

    <ul class="divide-y divide-slate-100 border-t border-slate-200 text-sm">
      <li
        v-for="day in weather.daily"
        :key="day.date"
        class="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-2.5"
      >
        <span class="font-medium">{{ formatWeekday(day.date) }}</span>
        <span class="text-slate-600">
          {{ day.condition }}
          <span v-if="day.precipitationChance !== null" class="text-slate-400">
            · {{ day.precipitationChance }}%
          </span>
        </span>
        <span class="tabular-nums">
          {{ formatTemperature(day.high) }}
          <span class="text-slate-400">/ {{ formatTemperature(day.low) }}</span>
        </span>
      </li>
    </ul>
  </article>
</template>
