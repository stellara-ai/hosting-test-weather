import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { Unit } from '@/services/weather'

export const STORAGE_KEY = 'hosting-test-weather:preferences'

interface Persisted {
  savedCities: string[]
  unit: Unit
}

const DEFAULTS: Persisted = { savedCities: [], unit: 'fahrenheit' }

function isUnit(value: unknown): value is Unit {
  return value === 'fahrenheit' || value === 'celsius'
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS
    const { savedCities, unit } = parsed as Record<string, unknown>
    return {
      savedCities: Array.isArray(savedCities)
        ? savedCities.filter((city): city is string => typeof city === 'string')
        : DEFAULTS.savedCities,
      unit: isUnit(unit) ? unit : DEFAULTS.unit,
    }
  } catch {
    return DEFAULTS
  }
}

function sameCity(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export const usePreferencesStore = defineStore('preferences', () => {
  const initial = load()
  const savedCities = ref<string[]>([...initial.savedCities])
  const unit = ref<Unit>(initial.unit)

  function persist() {
    try {
      const data: Persisted = { savedCities: savedCities.value, unit: unit.value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage can be unavailable or full (private mode, quota). The app
      // keeps working with in-memory state.
    }
  }

  function isSaved(city: string): boolean {
    return savedCities.value.some((saved) => sameCity(saved, city))
  }

  function saveCity(city: string) {
    const name = city.trim()
    if (!name || isSaved(name)) return
    savedCities.value.push(name)
    persist()
  }

  function removeCity(city: string) {
    savedCities.value = savedCities.value.filter((saved) => !sameCity(saved, city))
    persist()
  }

  function setUnit(next: Unit) {
    unit.value = next
    persist()
  }

  return { savedCities, unit, isSaved, saveCity, removeCity, setUnit }
})
