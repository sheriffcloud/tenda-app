/**
 * `amountWindowConditions` — the shared amount-window guard (#101).
 *
 * The rule the gigs feed and the exchange order book both run. Proving it here
 * rather than twice through two routes is the point of extracting it: a route
 * test can only send what a route accepts, while the guard's contract is over
 * every string a querystring can carry.
 *
 * What the route tests still owe, and this file cannot: that each route CALLS
 * it, in the right position among its sibling filters, and that the message
 * reaches the client. Those live in integration/exchange-amount-window.test.ts
 * and gigs-listing.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode } from '@tenda/shared'
import type { AppError } from '@server/lib/errors'
import { amountWindowConditions } from '@server/lib/amount-window'

/** Every refusal is the same 400 VALIDATION_ERROR; only the message differs. */
function assertRefused(query: { min_amount_raw?: string; max_amount_raw?: string }, message: RegExp): void {
  assert.throws(
    () => amountWindowConditions(query),
    (err: AppError) => {
      assert.strictEqual(err.statusCode, 400)
      assert.strictEqual(err.code, ErrorCode.VALIDATION_ERROR)
      assert.match(err.message, message)
      return true
    },
  )
}

test('amountWindow: no bounds is no conditions, not an error', () => {
  // The overwhelmingly common case — most requests carry no window at all.
  assert.deepStrictEqual(amountWindowConditions({}), [])
})

test('amountWindow: each bound contributes exactly one condition', () => {
  assert.strictEqual(amountWindowConditions({ min_amount_raw: '1' }).length, 1)
  assert.strictEqual(amountWindowConditions({ max_amount_raw: '1' }).length, 1)
  assert.strictEqual(amountWindowConditions({ min_amount_raw: '1', max_amount_raw: '2' }).length, 2)
})

test('amountWindow: zero is a legitimate bound, not a missing one', () => {
  // '0' is canonical amount_raw — isAmountRaw accepts it — so it must produce a
  // condition rather than read as "no bound at all".
  //
  // What this case does NOT prove, because the mutation was run and survived:
  // swapping `!== undefined` for a bare truthiness check is an EQUIVALENT
  // mutant here. '0' is a STRING, and the only falsy string is '', which the
  // format guard above has already rejected — so by the time a bound reaches
  // the push it is always truthy. (A `Number(...)` coercion WOULD drop it, but
  // that mutant does not compile: it widens the type back to undefined.) The
  // case is held up by its length assertions, which die when either push is
  // deleted, not by anything zero-specific.
  assert.strictEqual(amountWindowConditions({ min_amount_raw: '0' }).length, 1)
  assert.strictEqual(amountWindowConditions({ min_amount_raw: '0', max_amount_raw: '0' }).length, 2)
})

test('amountWindow: an equal window is allowed (the boundary is inclusive)', () => {
  // min === max selects exactly that amount. `>` rather than `>=` in the
  // ordering check is what makes this legal, and nothing else pins it.
  assert.strictEqual(amountWindowConditions({ min_amount_raw: '500', max_amount_raw: '500' }).length, 2)
})

test('amountWindow: the ordering check is numeric, not lexicographic', () => {
  // '9' > '10' as text. A string compare would refuse this window and accept
  // its inverse — both wrong, and both invisible to a test that only uses
  // same-length numbers.
  assert.strictEqual(amountWindowConditions({ min_amount_raw: '9', max_amount_raw: '10' }).length, 2)
  assertRefused({ min_amount_raw: '10', max_amount_raw: '9' }, /min_amount_raw must be ≤ max_amount_raw/)
})

test('amountWindow: a non-canonical min is refused by name', () => {
  // Each of these is a plausible thing a client sends, and none is canonical
  // amount_raw: a decimal, a signed value, padded digits, whitespace, empty,
  // exponent form, and a non-number.
  for (const bad of ['1.5', '-5', '007', ' 42', '42 ', '', '1e3', 'abc', '0x2a']) {
    assertRefused({ min_amount_raw: bad }, /min_amount_raw must be a decimal integer string/)
  }
})

test('amountWindow: a non-canonical max is refused by its OWN name', () => {
  // The twin. It went untested on both routes until #103 — every existing case
  // reached for `min` and supplied a valid `max` beside it, so this guard's
  // throw had never run. Asserting the message is what keeps the two apart.
  for (const bad of ['1.5', '-5', '007', '', 'abc']) {
    assertRefused({ max_amount_raw: bad }, /max_amount_raw must be a decimal integer string/)
  }
})

test('amountWindow: the min bound is checked before the max', () => {
  // Both bounds malformed: the caller is told about `min` first. Order is
  // behaviour here for the same reason it is at the call sites — the statuses
  // are identical, so the message is the whole of what a client learns.
  assertRefused(
    { min_amount_raw: 'nope', max_amount_raw: 'also-nope' },
    /min_amount_raw must be a decimal integer string/,
  )
})

test('amountWindow: bounds are validated before they are compared', () => {
  // A malformed bound must not reach `BigInt()`, which throws a SyntaxError
  // rather than an AppError — a 500 where a 400 belongs.
  assertRefused(
    { min_amount_raw: 'abc', max_amount_raw: '10' },
    /min_amount_raw must be a decimal integer string/,
  )
  assertRefused(
    { min_amount_raw: '10', max_amount_raw: 'abc' },
    /max_amount_raw must be a decimal integer string/,
  )
})
