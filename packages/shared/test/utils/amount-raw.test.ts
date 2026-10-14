import { test } from 'node:test'
import assert from 'node:assert'
import { AMOUNT_RAW_PATTERN, isAmountRaw } from '../../src'

// The pattern is PUBLISHED (Agent API document), so its exact edge behaviour
// is contract: canonical decimal integers only.
test('AMOUNT_RAW_PATTERN admits canonical base-unit integers and nothing else', () => {
  for (const ok of ['0', '7', '10', '1000000', '9'.repeat(78)]) {
    assert.strictEqual(AMOUNT_RAW_PATTERN.test(ok), true, ok)
    assert.strictEqual(isAmountRaw(ok), true, ok)
  }
  for (const bad of ['', '007', '-1', '+1', ' 1', '1 ', '1.0', '1e3', '0x10', '1_000', '١']) {
    assert.strictEqual(AMOUNT_RAW_PATTERN.test(bad), false, JSON.stringify(bad))
    assert.strictEqual(isAmountRaw(bad), false, JSON.stringify(bad))
  }
  // Not a string is never an amount, whatever it prints as.
  assert.strictEqual(isAmountRaw(10), false)
  assert.strictEqual(isAmountRaw(null), false)
})
