/**
 * lib/validation — ensureIntInRange, extracted from the admin platform-config
 * route where each new tunable was adding another hand-written bounds check.
 * Four call sites now share it, so its edges are worth pinning directly.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { ErrorCode } from '@tenda/shared'
import { ensureIntInRange } from '@server/lib/validation'
import { AppError } from '@server/lib/errors'

function expect400(value: number, match: RegExp) {
  assert.throws(
    () => ensureIntInRange(value, 'field', 1, 10),
    (err: unknown) =>
      err instanceof AppError &&
      err.statusCode === 400 &&
      err.code === ErrorCode.VALIDATION_ERROR &&
      match.test(err.message),
  )
}

test('undefined passes — PATCH bodies are partial', () => {
  assert.doesNotThrow(() => ensureIntInRange(undefined, 'field', 1, 10))
})

test('both bounds are inclusive', () => {
  assert.doesNotThrow(() => ensureIntInRange(1, 'field', 1, 10))
  assert.doesNotThrow(() => ensureIntInRange(10, 'field', 1, 10))
})

test('a value inside the range passes', () => {
  assert.doesNotThrow(() => ensureIntInRange(5, 'field', 1, 10))
})

test('rejects one below and one above the range', () => {
  expect400(0, /between 1 and 10/)
  expect400(11, /between 1 and 10/)
})

test('rejects non-integers inside the range', () => {
  expect400(2.5, /integer/)
})

test('rejects negatives against a zero minimum', () => {
  assert.throws(() => ensureIntInRange(-1, 'fee_bps', 0, 1000), (e: unknown) => e instanceof AppError)
  assert.doesNotThrow(() => ensureIntInRange(0, 'fee_bps', 0, 1000))
})

test('rejects NaN and Infinity', () => {
  expect400(Number.NaN, /integer/)
  expect400(Number.POSITIVE_INFINITY, /integer/)
})

test('the message names the field so a multi-field PATCH says which one failed', () => {
  assert.throws(
    () => ensureIntInRange(99, 'max_pending_gigs', 1, 10),
    (err: unknown) => err instanceof AppError && err.message.startsWith('max_pending_gigs'),
  )
})
