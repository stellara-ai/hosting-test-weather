/**
 * The only module that talks to a weather provider. The rest of the app
 * depends on the `WeatherService` interface and the types below, so the
 * provider (currently Open-Meteo) can be replaced by editing this file.
 */

export type Unit = 'fahrenheit' | 'celsius'

export interface Place {
  name: string
  region: string | null
  country: string | null
  latitude: number
  longitude: number
}

export interface CurrentConditions {
  temperature: number
  feelsLike: number
  humidity: number
  windSpeed: number
  condition: string
}

export interface DailyForecast {
  /** ISO date, e.g. "2026-11-15". */
  date: string
  high: number
  low: number
  condition: string
  /** Percent, or null when the provider has no value. */
  precipitationChance: number | null
}

export interface Weather {
  place: Place
  unit: Unit
  windUnit: 'mph' | 'km/h'
  current: CurrentConditions
  daily: DailyForecast[]
}

export interface WeatherService {
  /** Resolves a free-text city name to a place, or null when nothing matches. */
  findPlace(query: string, signal?: AbortSignal): Promise<Place | null>
  getWeather(place: Place, unit: Unit, signal?: AbortSignal): Promise<Weather>
}

export class WeatherServiceError extends Error {
  override name = 'WeatherServiceError'
}

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const FORECAST_DAYS = 5

interface GeocodingResponse {
  results?: {
    name: string
    latitude: number
    longitude: number
    admin1?: string
    country?: string
  }[]
}

interface ForecastResponse {
  current: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    wind_speed_10m: number
    weather_code: number
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: (number | null)[]
  }
}

/** WMO weather interpretation codes, as documented by Open-Meteo. */
const CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Light freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Light snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
}

function describe(code: number): string {
  return CONDITIONS[code] ?? 'Unknown conditions'
}

async function fetchJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new WeatherServiceError('Could not reach the weather service.', { cause })
  }
  if (!response.ok) {
    throw new WeatherServiceError(`The weather service responded with status ${response.status}.`)
  }
  return (await response.json()) as T
}

export const weatherService: WeatherService = {
  async findPlace(query, signal) {
    const url = new URL(GEOCODING_URL)
    url.search = new URLSearchParams({
      name: query,
      count: '1',
      language: 'en',
      format: 'json',
    }).toString()

    const data = await fetchJson<GeocodingResponse>(url, signal)
    const match = data.results?.[0]
    if (!match) return null

    return {
      name: match.name,
      region: match.admin1 ?? null,
      country: match.country ?? null,
      latitude: match.latitude,
      longitude: match.longitude,
    }
  },

  async getWeather(place, unit, signal) {
    const windUnit = unit === 'fahrenheit' ? 'mph' : 'km/h'
    const url = new URL(FORECAST_URL)
    url.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      temperature_unit: unit,
      wind_speed_unit: unit === 'fahrenheit' ? 'mph' : 'kmh',
      timezone: 'auto',
      forecast_days: String(FORECAST_DAYS),
    }).toString()

    const data = await fetchJson<ForecastResponse>(url, signal)
    if (!data.current || !data.daily) {
      throw new WeatherServiceError('The weather service returned an unexpected response.')
    }

    const { current, daily } = data
    return {
      place,
      unit,
      windUnit,
      current: {
        temperature: current.temperature_2m,
        feelsLike: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        condition: describe(current.weather_code),
      },
      daily: daily.time.map((date, i) => ({
        date,
        high: daily.temperature_2m_max[i] ?? Number.NaN,
        low: daily.temperature_2m_min[i] ?? Number.NaN,
        condition: describe(daily.weather_code[i] ?? -1),
        precipitationChance: daily.precipitation_probability_max[i] ?? null,
      })),
    }
  },
}
