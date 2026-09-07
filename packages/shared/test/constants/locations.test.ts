import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LOCATIONS,
  ALL_CITIES,
  findCountryForCity,
  isCityInCountry,
  coerceCityForCountry,
} from '../../src/constants/locations'
import { SUPPORTED_CURRENCIES } from '../../src/constants/currencies'

test('LOCATIONS: every country has a name, flag, supported currency, and non-empty cities', () => {
  for (const [code, entry] of Object.entries(LOCATIONS)) {
    assert.ok(entry.name.length > 0, `${code} name`)
    assert.ok(entry.flag.length > 0, `${code} flag`)
    assert.ok((SUPPORTED_CURRENCIES as readonly string[]).includes(entry.currency), `${code} currency supported`)
    assert.ok(entry.cities.length > 0, `${code} has cities`)
  }
})

test('ALL_CITIES: flattens every city and has no duplicates across countries', () => {
  const expectedCount = Object.values(LOCATIONS).reduce((n, l) => n + l.cities.length, 0)
  assert.equal(ALL_CITIES.length, expectedCount)
  assert.equal(new Set(ALL_CITIES).size, ALL_CITIES.length, 'city names are globally unique')
})

test('findCountryForCity: resolves a known city, undefined for an unknown one', () => {
  assert.equal(findCountryForCity('Lagos'), 'NG')
  assert.equal(findCountryForCity('London'), 'GB')
  assert.equal(findCountryForCity('Atlantis'), undefined)
})

test('isCityInCountry: true only when the pair is consistent', () => {
  assert.equal(isCityInCountry('NG', 'Lagos'), true)
  assert.equal(isCityInCountry('KE', 'Lagos'), false) // orphan-city case
  assert.equal(isCityInCountry('ZZ', 'Lagos'), false) // unknown country
  assert.equal(isCityInCountry(null, 'Lagos'), false)
  assert.equal(isCityInCountry('NG', null), false)
  assert.equal(isCityInCountry(undefined, undefined), false)
})

test('coerceCityForCountry: keeps a consistent city, nulls an inconsistent or missing one', () => {
  assert.equal(coerceCityForCountry('NG', 'Lagos'), 'Lagos')
  assert.equal(coerceCityForCountry('KE', 'Lagos'), null) // country=KE + city=Lagos -> null
  assert.equal(coerceCityForCountry('NG', null), null)
  assert.equal(coerceCityForCountry(null, 'Lagos'), null) // city given but no valid country
})
