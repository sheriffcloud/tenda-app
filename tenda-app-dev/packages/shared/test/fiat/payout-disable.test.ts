import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PAYOUT_COUNTRY_SPECS,
  SUPPORTED_PAYOUT_COUNTRIES,
  PAYOUT_CURRENCIES,
  getPayoutSpec,
  countryDisplayName,
  getPayoutRail,
  payoutCurrencyForCountry,
} from '../../src/fiat/payout'
import { SUPPORTED_CURRENCIES } from '../../src/constants/currencies'

/**
 * Retiring a market. Split out of payout.test.ts on the 300-line rule, and the
 * seam is the question being asked: that file asks what the registry IS, this
 * one asks what happens when an entry leaves it.
 */

/**
 * Disabling a market is commenting its line out of PAYOUT_COUNTRY_SPECS, so
 * these pin the two properties that make that sufficient — and the one that
 * makes it SAFE.
 *
 * Sufficient: every derived list reads the registry rather than restating it,
 * so removing a line removes the market everywhere at once.
 *
 * Safe: a country that is not in the registry resolves to NOTHING, not to a
 * neighbour. Before the fallback was removed, commenting out a market made its
 * accounts resolve to NGN — so disabling a corridor would have silently
 * re-pointed its users at Nigeria, and their existing accounts would have
 * satisfied the guard on a naira-priced offer.
 *
 * 'US' and 'ZW' stand in for a commented-out market: to every function here,
 * a disabled country and a country we never had are the same thing.
 */
const DISABLED = 'US'

test('disabling a market: every derived list agrees with the registry', () => {
  assert.deepEqual(SUPPORTED_PAYOUT_COUNTRIES, Object.keys(PAYOUT_COUNTRY_SPECS))
  assert.deepEqual(
    new Set(PAYOUT_CURRENCIES),
    new Set(Object.values(PAYOUT_COUNTRY_SPECS).map((s) => s.currency)),
  )
})

/**
 * AND THE VALUES ARE DERIVED, not merely correct. The assertion above compares
 * two things that agree today, so it passes just as happily for a hand-written
 * `['NG','KE','GH','ZA','PH','AE']` — proved by replacing the derivation with
 * exactly that literal and watching every test stay green. A hand-list would
 * fail only on the day a market is commented out and the list is not, which is
 * the day the check exists for. So this one reads the source.
 */
test('disabling a market: the lists are computed from the registry, not restated', () => {
  const source = readFileSync(resolve(__dirname, '../../src/fiat/payout/index.ts'), 'utf8')
  assert.match(
    source,
    /SUPPORTED_PAYOUT_COUNTRIES[^=]*=\s*Object\.keys\(PAYOUT_COUNTRY_SPECS\)/,
    'SUPPORTED_PAYOUT_COUNTRIES must be Object.keys of the registry',
  )
  assert.match(
    source,
    /PAYOUT_CURRENCIES[^=]*=[\s\S]*Object\.values\(PAYOUT_COUNTRY_SPECS\)/,
    'PAYOUT_CURRENCIES must be derived from the registry specs',
  )
})

test('disabling a market: the country resolves to nothing anywhere', () => {
  assert.equal(getPayoutSpec(DISABLED), null)
  assert.equal(getPayoutRail(DISABLED, 'bank'), null)
  assert.equal(getPayoutRail(DISABLED, 'mobile_money'), null)
  assert.equal(payoutCurrencyForCountry(DISABLED), null)
  assert.ok(!SUPPORTED_PAYOUT_COUNTRIES.includes(DISABLED))
})

/**
 * The specific regression. A disabled country must never inherit a currency
 * from a market that is still live — that is what turns "we stopped serving
 * you" into "you now quote in someone else's money".
 */
test('disabling a market: its country never inherits a live market currency', () => {
  for (const country of [DISABLED, 'ZW', 'XX', '']) {
    // `null` IS the assertion. A follow-up `!PAYOUT_CURRENCIES.includes(...)`
    // stood here and could never fail: the line above has already established
    // the value is null, so it only ever asked whether the list contains null.
    // It also needed an `as never` to compile, which was the tell.
    assert.equal(payoutCurrencyForCountry(country), null, `${country} resolved to a currency`)
  }
})

/**
 * The currency vocabulary is deliberately NOT the market list. Retiring a
 * market must not break the display of trades that already happened in it, so
 * SUPPORTED_CURRENCIES stays wider than PAYOUT_CURRENCIES.
 */
test('disabling a market leaves its currency formattable for historical rows', () => {
  for (const currency of PAYOUT_CURRENCIES) {
    assert.ok(SUPPORTED_CURRENCIES.includes(currency))
  }
  assert.ok(
    SUPPORTED_CURRENCIES.length > PAYOUT_CURRENCIES.length,
    'a currency that is no longer a market must still be a currency',
  )
})

/**
 * A plain object inherits from Object.prototype, so a bare
 * `PAYOUT_COUNTRY_SPECS[country]` answers with something TRUTHY for
 * '__proto__', 'constructor' and 'toString'. `getPayoutSpec` is documented as
 * returning null for anything it does not know, and callers gate on exactly
 * that — `if (getPayoutSpec(c) === null) reject` — so those three strings
 * walked through the check.
 *
 * Blocked at the route today by a two-character cap on `country`, which is a
 * property of one caller rather than of this function.
 */
test('inherited Object keys are not payout markets', () => {
  for (const key of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
    assert.equal(getPayoutSpec(key), null, `${key} resolved to a spec`)
    assert.equal(getPayoutRail(key, 'bank'), null, `${key} resolved to a rail`)
    assert.equal(payoutCurrencyForCountry(key), null, `${key} resolved to a currency`)
    assert.ok(!SUPPORTED_PAYOUT_COUNTRIES.includes(key))
  }
})

/**
 * An account saved before the market was disabled still renders: the country
 * falls back to its raw code rather than throwing or reading as blank, so the
 * row stays recognisable to the person who saved it.
 */
test('disabling a market: an existing account still displays its country', () => {
  assert.equal(countryDisplayName(DISABLED), DISABLED)
})
