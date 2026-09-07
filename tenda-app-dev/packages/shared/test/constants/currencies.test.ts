import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_META,
  DEFAULT_CURRENCY,
  isSupportedCurrency,
} from '../../src/constants/currencies'

test('SUPPORTED_CURRENCIES: non-empty and duplicate-free', () => {
  assert.ok(SUPPORTED_CURRENCIES.length > 0)
  assert.equal(new Set(SUPPORTED_CURRENCIES).size, SUPPORTED_CURRENCIES.length)
})

test('CURRENCY_META: one complete entry per supported currency, no extras', () => {
  assert.deepEqual(Object.keys(CURRENCY_META).sort(), [...SUPPORTED_CURRENCIES].sort())
  for (const code of SUPPORTED_CURRENCIES) {
    const meta = CURRENCY_META[code]
    assert.ok(meta.symbol.length > 0, `${code} symbol`)
    assert.ok(meta.name.length > 0, `${code} name`)
    assert.ok(meta.flag.length > 0, `${code} flag`)
    assert.match(meta.locale, /^[a-z]{2}-[A-Z]{2}$/, `${code} locale`)
    assert.equal(meta.coingeckoKey, code.toLowerCase(), `${code} coingeckoKey is the lowercased code`)
  }
})

test('DEFAULT_CURRENCY is itself a supported currency', () => {
  // The invariant that makes the default safe to fall back TO. A default
  // outside the vocabulary would index CURRENCY_META to undefined and throw on
  // the next property read — the exact failure it exists to prevent (#88).
  assert.ok(isSupportedCurrency(DEFAULT_CURRENCY))
  assert.ok(CURRENCY_META[DEFAULT_CURRENCY] !== undefined)
})

test('isSupportedCurrency admits every listed code', () => {
  // Derived from the vocabulary rather than spot-checked, so a currency added
  // tomorrow is covered without anyone remembering to come back.
  for (const code of SUPPORTED_CURRENCIES) {
    assert.ok(isSupportedCurrency(code), code)
  }
})

test('isSupportedCurrency refuses anything else, whatever its type', () => {
  // The callers are boundaries — parsed JSON out of device storage, a payload —
  // so the values it must refuse are not all strings.
  for (const value of ['XXX', 'ngn', '', ' NGN', null, undefined, 42, {}, ['NGN'], true]) {
    assert.equal(isSupportedCurrency(value), false, JSON.stringify(value) ?? 'undefined')
  }
})

/**
 * EVERY LOCALE MUST RENDER A LATIN, LTR AMOUNT.
 *
 * The app is English and its money sits inline in English sentences ("You
 * receive X from the buyer"). AED shipped with `ar-AE`, which formats as
 * `\u200F85,000 \u062F.\u0625.\u200F` — the Arabic symbol wrapped in U+200F RIGHT-TO-LEFT
 * MARKs. Those are invisible control characters, and they flip the direction of
 * the text around them, so an amount pasted into a sentence takes the sentence
 * with it. `en-AE` gives "AED 85,000".
 *
 * This is a property of the LOCALE, not of the currency, so it is asserted for
 * every entry rather than for the one that got it wrong.
 */
test('every currency formats as a Latin, direction-neutral amount', () => {
  // U+200E/U+200F (LRM/RLM), U+061C (Arabic letter mark), and the isolate
  // controls U+2066–U+2069 all reorder neighbouring text.
  const DIRECTIONAL = /[\u200E\u200F\u061C\u2066-\u2069]/
  for (const code of SUPPORTED_CURRENCIES) {
    const { locale } = CURRENCY_META[code]
    const rendered = (85000).toLocaleString(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    })
    assert.ok(
      !DIRECTIONAL.test(rendered),
      `${code} (${locale}) renders directional control characters: ${JSON.stringify(rendered)}`,
    )
    // Latin digits: the amount must still contain the ASCII digits of 85000.
    assert.match(rendered, /85[,.\s\u00a0]?000/, `${code} (${locale}) did not render Latin digits`)
  }
})

test('every locale is a well-formed BCP 47 tag its own runtime accepts', () => {
  for (const code of SUPPORTED_CURRENCIES) {
    const { locale } = CURRENCY_META[code]
    // Throws RangeError on a malformed tag rather than falling back silently.
    assert.doesNotThrow(() => new Intl.NumberFormat(locale), `${code} locale ${locale}`)
    assert.match(locale, /^[a-z]{2}-[A-Z]{2}$/, `${code} locale ${locale} is not language-REGION`)
  }
})
