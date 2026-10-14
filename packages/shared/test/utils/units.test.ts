import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUnits, formatUnits, sanitizeDecimalText } from '../../src/utils/units'

// parseUnits ---------------------------------------------------------------

test('parseUnits: whole and fractional amounts at 6dp', () => {
  assert.equal(parseUnits('12.5', 6), '12500000')
  assert.equal(parseUnits('12', 6), '12000000')
  assert.equal(parseUnits('0', 6), '0')
  assert.equal(parseUnits('0.000001', 6), '1')
})

test('parseUnits: 9dp (SOL) and 18dp (ETH) stay BigInt-exact past 2^53', () => {
  assert.equal(parseUnits('2.5', 9), '2500000000')
  // 1 ETH = 1e18 base units — the value float math corrupts.
  assert.equal(parseUnits('1', 18), '1000000000000000000')
  assert.equal(parseUnits('1.5', 18), '1500000000000000000')
  assert.equal(parseUnits('1234567.123456789012345678', 18), '1234567123456789012345678')
})

test('parseUnits: trims surrounding whitespace', () => {
  assert.equal(parseUnits('  3.25  ', 6), '3250000')
})

test('parseUnits: rejects excess precision, negatives, and non-decimals', () => {
  assert.equal(parseUnits('1.1234567', 6), null) // 7 frac digits > 6
  assert.equal(parseUnits('-1', 6), null)
  assert.equal(parseUnits('1.', 6), null)
  assert.equal(parseUnits('.5', 6), null)
  assert.equal(parseUnits('abc', 6), null)
  assert.equal(parseUnits('1e3', 6), null)
  assert.equal(parseUnits('', 6), null)
  assert.equal(parseUnits('1,000', 6), null)
})

test('parseUnits: zero decimals asset accepts only integers', () => {
  assert.equal(parseUnits('42', 0), '42')
  assert.equal(parseUnits('42.5', 0), null)
})

// formatUnits --------------------------------------------------------------

test('formatUnits: base units → trimmed decimal string', () => {
  assert.equal(formatUnits('12500000', 6), '12.5')
  assert.equal(formatUnits('12000000', 6), '12')
  assert.equal(formatUnits('1', 6), '0.000001')
  assert.equal(formatUnits('0', 6), '0')
})

test('formatUnits: 18dp values stay exact (no float rounding)', () => {
  assert.equal(formatUnits('1000000000000000000', 18), '1')
  assert.equal(formatUnits('1500000000000000000', 18), '1.5')
  assert.equal(formatUnits('1234567123456789012345678', 18), '1234567.123456789012345678')
})

test('formatUnits: zero decimals is a passthrough integer', () => {
  assert.equal(formatUnits('42', 0), '42')
})

test('parseUnits ∘ formatUnits round-trips across decimals', () => {
  for (const [display, decimals] of [['1.5', 18], ['0.05', 9], ['5', 6], ['0', 6]] as const) {
    const raw = parseUnits(display, decimals)
    assert.ok(raw !== null)
    // formatUnits trims, so compare via a re-parse for canonical equality.
    assert.equal(parseUnits(formatUnits(raw, decimals), decimals), raw)
  }
})

test('sanitizeDecimalText: at ZERO decimals there is no fraction to open', () => {
  // The branch a 0-decimal asset would take. It is not reachable through the
  // gig field today (nothing in the registry is below 6), but the helper is
  // exported and the alternative — returning '12.' for an asset that cannot
  // hold a fraction — invites a decimal point that can never mean anything.
  assert.equal(sanitizeDecimalText('12.', 0), '12')
  assert.equal(sanitizeDecimalText('12.99', 0), '12')
  assert.equal(sanitizeDecimalText('12', 0), '12')
})

test('sanitizeDecimalText: the precision limit is the argument, not an asset', () => {
  // It is shared by the gig field (asset decimals) and mobile's fiat entry
  // (FIAT_ENTRY_DECIMALS), so the same text must land differently per limit.
  assert.equal(sanitizeDecimalText('1.23456', 2), '1.23')
  assert.equal(sanitizeDecimalText('1.23456', 6), '1.23456')
  assert.equal(sanitizeDecimalText('1.23456', 18), '1.23456')
})
