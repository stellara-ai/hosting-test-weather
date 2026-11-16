import type { Place } from '@/services/weather'

export function formatTemperature(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value)}°` : '–'
}

/** Formats an ISO date ("2026-11-15") as a short weekday in the viewer's locale. */
export function formatWeekday(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? isoDate
    : date.toLocaleDateString(undefined, { weekday: 'short' })
}

export function formatPlace(place: Place): string {
  return [place.name, place.region, place.country].filter(Boolean).join(', ')
}
