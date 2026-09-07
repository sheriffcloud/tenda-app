/**
 * City options for a new-gig subscription (Stage 6). A subscription targets a
 * city by NAME — the server matches `gig.city === subscription.city` regardless
 * of country (country isn't stored) — so the list is a flat, de-duplicated set
 * of city names across the LOCATIONS registry, pinned under an "All cities"
 * wildcard. The country flag/name rides along as a sublabel for recognition.
 */

import { LOCATIONS } from '@tenda/shared'
import type { UpsertSubscriptionInput } from '@tenda/shared'
import type { SearchSheetItem } from '@/components/form/SearchSheet'

/** Sentinel matching the server's any-city wildcard (upsert stores '*'). */
export const ALL_CITIES_KEY = '*'

/**
 * Upsert body for a picked city key. The wildcard maps to an EMPTY body so the
 * server applies its own '*' default (identical to the pre-existing "subscribe
 * to all" call); a concrete city becomes a city filter.
 */
export function subscriptionBody(city: string): UpsertSubscriptionInput {
  return city === ALL_CITIES_KEY ? {} : { city }
}

export function subscriptionCityItems(): SearchSheetItem[] {
  const seen = new Set<string>()
  const cities: SearchSheetItem[] = []
  for (const entry of Object.values(LOCATIONS)) {
    for (const city of entry.cities) {
      if (seen.has(city)) continue // first country wins for a shared name
      seen.add(city)
      cities.push({ key: city, label: city, sublabel: `${entry.flag} ${entry.name}` })
    }
  }
  cities.sort((a, b) => a.label.localeCompare(b.label))
  return [{ key: ALL_CITIES_KEY, label: 'All cities' }, ...cities]
}
