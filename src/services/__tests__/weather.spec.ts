import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WeatherServiceError, weatherService, type Place } from '../weather'

const miami: Place = {
  name: 'Miami',
  region: 'Florida',
  country: 'United States',
  latitude: 25.77,
  longitude: -80.19,
}

const forecastBody = {
  current: {
    temperature_2m: 66.7,
    apparent_temperature: 65.5,
    relative_humidity_2m: 63,
    wind_speed_10m: 5.7,
    weather_code: 0,
  },
  daily: {
    time: ['2026-11-15', '2026-11-16'],
    weather_code: [3, 65],
    temperature_2m_max: [77.9, 79.2],
    temperature_2m_min: [57.3, 63.8],
    precipitation_probability_max: [3, null],
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('weatherService', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function requestedUrl(): URL {
    return new URL(String(fetchMock.mock.calls[0]?.[0]))
  }

  describe('findPlace', () => {
    it('maps the first geocoding result to a place', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          results: [
            {
              name: 'Miami',
              latitude: 25.77,
              longitude: -80.19,
              admin1: 'Florida',
              country: 'United States',
            },
          ],
        }),
      )

      await expect(weatherService.findPlace('miami')).resolves.toEqual(miami)
      expect(requestedUrl().searchParams.get('name')).toBe('miami')
    })

    it('returns null when nothing matches', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ generationtime_ms: 0.2 }))
      await expect(weatherService.findPlace('zzzzzz')).resolves.toBeNull()
    })
  })

  describe('getWeather', () => {
    it('requests the chosen unit and normalises the response', async () => {
      fetchMock.mockResolvedValue(jsonResponse(forecastBody))

      const weather = await weatherService.getWeather(miami, 'celsius')

      const params = requestedUrl().searchParams
      expect(params.get('temperature_unit')).toBe('celsius')
      expect(params.get('wind_speed_unit')).toBe('kmh')
      expect(weather.windUnit).toBe('km/h')
      expect(weather.current).toEqual({
        temperature: 66.7,
        feelsLike: 65.5,
        humidity: 63,
        windSpeed: 5.7,
        condition: 'Clear sky',
      })
      expect(weather.daily).toEqual([
        { date: '2026-11-15', high: 77.9, low: 57.3, condition: 'Overcast', precipitationChance: 3 },
        {
          date: '2026-11-16',
          high: 79.2,
          low: 63.8,
          condition: 'Heavy rain',
          precipitationChance: null,
        },
      ])
    })

    it('throws a WeatherServiceError on an HTTP error', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: true }, 500))
      await expect(weatherService.getWeather(miami, 'fahrenheit')).rejects.toThrow(
        WeatherServiceError,
      )
    })

    it('throws a WeatherServiceError when the network fails', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
      await expect(weatherService.getWeather(miami, 'fahrenheit')).rejects.toThrow(
        'Could not reach the weather service.',
      )
    })
  })
})
