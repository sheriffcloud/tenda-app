/**
 * toBigIntOrNull — the shared safe parse behind every base-unit comparison.
 * `BigInt()` throws on anything it can't read, so the whole point of this
 * helper is that a bad amount becomes null (no answer) instead of an exception
 * at the call site. The NaN case is a regression guard: the gig form carries
 * `paymentRaw` as a number, and an unparseable one used to crash the nudge.
 */
import { toBigIntOrNull } from '@/wallet/balances/raw-amount'

test('parses base-unit strings exactly, past Number.MAX_SAFE_INTEGER', () => {
  expect(toBigIntOrNull('1000000000000000001')).toBe(1000000000000000001n)
})

test('parses the number form the gig form carries', () => {
  expect(toBigIntOrNull(10_000_000)).toBe(10000000n)
})

test('zero is a real answer, not a failure', () => {
  expect(toBigIntOrNull('0')).toBe(0n)
  expect(toBigIntOrNull(0)).toBe(0n)
})

test('NaN is null, not a throw (would take the gig form down)', () => {
  expect(toBigIntOrNull(NaN)).toBeNull()
})

test('Infinity is null, not a throw', () => {
  expect(toBigIntOrNull(Infinity)).toBeNull()
  expect(toBigIntOrNull(-Infinity)).toBeNull()
})

test('a fractional number truncates — base units have no sub-unit precision', () => {
  expect(toBigIntOrNull(1.9)).toBe(1n)
})

test('a fractional STRING is null — a raw amount is never decimal on the wire', () => {
  expect(toBigIntOrNull('12.5')).toBeNull()
})

test('junk is null', () => {
  expect(toBigIntOrNull('not-a-number')).toBeNull()
})

test('blank input is null, NOT zero — BigInt("") is 0n, which would lie', () => {
  // The JS footgun this helper exists to contain: an absent amount must read
  // as "no answer", never as a confident zero balance.
  expect(toBigIntOrNull('')).toBeNull()
  expect(toBigIntOrNull('   ')).toBeNull()
})

test('surrounding whitespace on a real amount still parses', () => {
  expect(toBigIntOrNull(' 5 ')).toBe(5n)
})

test('negatives parse — the caller decides whether one is meaningful', () => {
  expect(toBigIntOrNull('-5')).toBe(-5n)
})
