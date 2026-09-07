import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SUPPORTED_CURRENCIES, CURRENCY_META } from '../../src/constants/currencies'

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
