/**
 * Subscription city options (Stage 6). Pure derivation from the LOCATIONS
 * registry: the "All cities" wildcard is pinned first, and city names are
 * unique, sorted, and carry a country sublabel.
 */
import { subscriptionCityItems, subscriptionBody, ALL_CITIES_KEY } from '@/lib/subscriptionCities'

test('the All-cities wildcard is pinned first', () => {
  const [first] = subscriptionCityItems()
  expect(first).toEqual({ key: ALL_CITIES_KEY, label: 'All cities' })
})

test('city names are unique, alphabetically sorted, and keyed by name', () => {
  const cities = subscriptionCityItems().slice(1)
  const labels = cities.map((c) => c.label)
  expect(new Set(labels).size).toBe(labels.length) // deduped
  expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  expect(cities.every((c) => c.key === c.label)).toBe(true) // key === city name
})

test('a known city carries its country as a sublabel', () => {
  const lagos = subscriptionCityItems().find((c) => c.label === 'Lagos')
  expect(lagos).toBeDefined()
  expect(lagos?.key).toBe('Lagos')
  expect(lagos?.sublabel).toContain('Nigeria')
})

describe('subscriptionBody', () => {
  test('the wildcard maps to an empty body (server default all-cities)', () => {
    expect(subscriptionBody(ALL_CITIES_KEY)).toEqual({})
  })
  test('a concrete city maps to a city filter', () => {
    expect(subscriptionBody('Lagos')).toEqual({ city: 'Lagos' })
  })
})
