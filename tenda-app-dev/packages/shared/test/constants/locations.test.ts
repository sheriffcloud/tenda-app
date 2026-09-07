import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LOCATIONS,
  ALL_CITIES,
  findCountryForCity,
  isCityInCountry,
  isCountryCode,
  localeCountryOrNull,
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

test('isCountryCode: narrows supported markets and rejects everything else', () => {
  assert.equal(isCountryCode('NG'), true)
  assert.equal(isCountryCode('US'), true)
  assert.equal(isCountryCode('FR'), false)
  assert.equal(isCountryCode('HANS'), false)
  assert.equal(isCountryCode(''), false)
})

test('isCountryCode: a key inherited from Object.prototype is not a country', () => {
  // The bug `getPayoutSpec` documents in this same package, on the other
  // vocabulary: LOCATIONS is a plain object, so `'toString' in LOCATIONS` is
  // TRUE and the guard waved three strings through every caller that gates on
  // it — including the server's country validation, which then stored them.
  for (const key of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
    assert.equal(isCountryCode(key), false, key)
  }
})

test('isCityInCountry: an inherited key is not a country, and does not THROW', () => {
  // `LOCATIONS['toString']` is a FUNCTION — truthy — so the `if (!entry) return
  // false` guard fell through and `entry.cities.includes(city)` threw a
  // TypeError. Reached through POST /v1/gigs and POST /v1/agent/tasks with
  // country 'toString' + any city, which answered 500 instead of a 400.
  for (const key of ['toString', 'constructor', '__proto__', 'valueOf']) {
    assert.equal(isCityInCountry(key, 'Lagos'), false, key)
    assert.equal(coerceCityForCountry(key, 'Lagos'), null, key)
  }
})

test('localeCountryOrNull: supported regions come through, case-insensitively', () => {
  assert.equal(localeCountryOrNull('en-NG'), 'NG')
  assert.equal(localeCountryOrNull('en-ng'), 'NG')
  assert.equal(localeCountryOrNull('en-US'), 'US')
  assert.equal(localeCountryOrNull('en-US-POSIX'), 'US')
})

test('localeCountryOrNull: a script subtag never masquerades as a country', () => {
  // The old naive split('-')[1] answered 'HANS' here — a "selected" country
  // the picker cannot display, soft-locking the composer's city step.
  assert.equal(localeCountryOrNull('zh-Hans-CN'), null) // CN unsupported → null, not HANS
  assert.equal(localeCountryOrNull('uz-Latn-UZ'), null)
  assert.equal(localeCountryOrNull('sr-Cyrl-RS'), null)
})

test('localeCountryOrNull: unsupported regions, bare languages and junk yield null', () => {
  assert.equal(localeCountryOrNull('fr-FR'), null)
  assert.equal(localeCountryOrNull('es-419'), null) // 3-digit UN region
  assert.equal(localeCountryOrNull('en'), null)
  assert.equal(localeCountryOrNull(''), null)
})
