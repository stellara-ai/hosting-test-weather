import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { STORAGE_KEY, usePreferencesStore } from '../preferences'

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

describe('preferences store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts with no saved cities and Fahrenheit', () => {
    const store = usePreferencesStore()
    expect(store.savedCities).toEqual([])
    expect(store.unit).toBe('fahrenheit')
  })

  it('saves cities without duplicates, ignoring case and whitespace', () => {
    const store = usePreferencesStore()
    store.saveCity('Miami')
    store.saveCity(' miami ')
    store.saveCity('  ')
    store.saveCity('Boston')
    expect(store.savedCities).toEqual(['Miami', 'Boston'])
    expect(store.isSaved('MIAMI')).toBe(true)
  })

  it('removes a city', () => {
    const store = usePreferencesStore()
    store.saveCity('Miami')
    store.saveCity('Boston')
    store.removeCity('miami')
    expect(store.savedCities).toEqual(['Boston'])
  })

  it('persists changes to localStorage', () => {
    const store = usePreferencesStore()
    store.saveCity('Miami')
    store.setUnit('celsius')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')).toEqual({
      savedCities: ['Miami'],
      unit: 'celsius',
    })
  })

  it('restores persisted state in a new store instance', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedCities: ['Lima'], unit: 'celsius' }))
    const store = usePreferencesStore()
    expect(store.savedCities).toEqual(['Lima'])
    expect(store.unit).toBe('celsius')
  })

  it('falls back to defaults when stored data is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const store = usePreferencesStore()
    expect(store.savedCities).toEqual([])
    expect(store.unit).toBe('fahrenheit')
  })

  it('keeps working when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const store = usePreferencesStore()
    expect(() => store.saveCity('Miami')).not.toThrow()
    expect(store.savedCities).toEqual(['Miami'])
  })
})
