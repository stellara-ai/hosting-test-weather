import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'

import {
  WeatherServiceError,
  weatherService,
  type Unit,
  type Weather,
  type WeatherService,
} from '@/services/weather'

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'error'

/**
 * Looks up a city by name and loads its weather. Refetches whenever the city
 * or the unit changes, and drops the result of any request it has superseded.
 */
export function useWeather(
  city: MaybeRefOrGetter<string>,
  unit: MaybeRefOrGetter<Unit>,
  service: WeatherService = weatherService,
) {
  const status = ref<WeatherStatus>('idle')
  const weather = shallowRef<Weather | null>(null)
  const errorMessage = ref('')
  let controller: AbortController | null = null

  async function load() {
    controller?.abort()
    const request = new AbortController()
    controller = request

    const name = toValue(city).trim()
    if (!name) {
      weather.value = null
      status.value = 'idle'
      return
    }

    status.value = 'loading'
    try {
      const place = await service.findPlace(name, request.signal)
      if (request.signal.aborted) return
      if (!place) {
        weather.value = null
        status.value = 'not-found'
        return
      }
      const result = await service.getWeather(place, toValue(unit), request.signal)
      if (request.signal.aborted) return
      weather.value = result
      status.value = 'ready'
    } catch (error) {
      if (request.signal.aborted) return
      weather.value = null
      errorMessage.value =
        error instanceof WeatherServiceError
          ? error.message
          : 'Something went wrong while loading the weather.'
      status.value = 'error'
    }
  }

  watch([() => toValue(city), () => toValue(unit)], load, { immediate: true })
  onScopeDispose(() => controller?.abort())

  return { status, weather, errorMessage, reload: load }
}
