/**
 * features/applications/service — the pure rules. No database: freshness, the
 * open-application cap, the assign hold, and message normalisation.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  APPLICATION_ASSIGN_HOLD_SECONDS,
  APPLICATION_MESSAGE_MAX_LENGTH,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '@tenda/shared'
import {
  applicationCapacityMessage,
  applicationExpiry,
  checkApplicationCapacity,
  heldExpiry,
  isApplicationMessageTooLong,
  isAssignable,
  normaliseApplicationMessage,
} from '@server/features/applications/service'

const NOW = new Date('2026-07-01T12:00:00Z')
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1_000)

// ---------- isAssignable ----------------------------------------------------

test('isAssignable: open and unexpired', () => {
  assert.strictEqual(isAssignable({ status: 'open', expires_at: later(60) }, NOW), true)
})

test('isAssignable: expiry is exclusive — exactly at the deadline is dead', () => {
  // The row is assignable while expires_at is in the FUTURE. At the instant it
  // arrives, the applicant's window is over.
  assert.strictEqual(isAssignable({ status: 'open', expires_at: NOW }, NOW), false)
  assert.strictEqual(isAssignable({ status: 'open', expires_at: later(-1) }, NOW), false)
})

// Expiry is judged against `now`, never "has the sweep run yet" — a row is dead
// the moment its deadline passes. Assigning a stale application would stamp
// assigned_from_application and make someone liable for a gig they forgot.
test('isAssignable: an expired row is dead even though the sweep has not touched it', () => {
  assert.strictEqual(
    isAssignable({ status: 'open', expires_at: later(-3600) }, NOW),
    false,
    'status is still open, but the deadline passed',
  )
})

test('isAssignable: no settled status is assignable', () => {
  const settled: ApplicationStatus[] = APPLICATION_STATUSES.filter((s) => s !== 'open')
  assert.strictEqual(settled.length, 5, 'guard against a new status slipping in untested')
  for (const status of settled) {
    assert.strictEqual(
      isAssignable({ status, expires_at: later(3600) }, NOW),
      false,
      `${status} must not be assignable even while unexpired`,
    )
  }
})

// ---------- capacity --------------------------------------------------------

test('checkApplicationCapacity: below, at, and above the limit', () => {
  assert.deepStrictEqual(checkApplicationCapacity(3, 5), {
    allowed: true,
    open: 3,
    limit: 5,
    remaining: 2,
  })
  // At the limit is blocked, not allowed — `open < limit`.
  assert.strictEqual(checkApplicationCapacity(5, 5).allowed, false)
  assert.strictEqual(checkApplicationCapacity(5, 5).remaining, 0)
})

test('checkApplicationCapacity: remaining is clamped when an operator lowers the cap', () => {
  // Someone holding 7 when the cap drops to 5 must not see "-2 remaining".
  const check = checkApplicationCapacity(7, 5)
  assert.strictEqual(check.allowed, false)
  assert.strictEqual(check.remaining, 0)
  assert.strictEqual(check.open, 7, 'the real count is still reported')
})

test('applicationCapacityMessage: singular/plural and the real numbers', () => {
  assert.match(applicationCapacityMessage(checkApplicationCapacity(1, 1)), /1 open application\b/)
  assert.match(applicationCapacityMessage(checkApplicationCapacity(5, 5)), /5 open applications\b/)
})

// ---------- expiry + hold ---------------------------------------------------

test('applicationExpiry: ttl seconds from now', () => {
  assert.deepStrictEqual(applicationExpiry(NOW, 3600), later(3600))
})

test('heldExpiry: extends a row that would expire during signing', () => {
  const soon = later(30)
  assert.deepStrictEqual(heldExpiry(soon, NOW), later(APPLICATION_ASSIGN_HOLD_SECONDS))
})

// A hold must never bring an expiry FORWARD: picking an applicant early in a
// 24h window would otherwise silently cut their row down to 15 minutes.
test('heldExpiry: never shortens a row that already outlives the hold', () => {
  const far = later(APPLICATION_ASSIGN_HOLD_SECONDS + 3600)
  assert.deepStrictEqual(heldExpiry(far, NOW), far)
})

test('heldExpiry: exactly at the hold boundary is left alone', () => {
  const exact = later(APPLICATION_ASSIGN_HOLD_SECONDS)
  assert.deepStrictEqual(heldExpiry(exact, NOW), exact)
})

// ---------- message ---------------------------------------------------------

test('normaliseApplicationMessage: absent, empty and whitespace all become null', () => {
  for (const input of [null, undefined, '', '   ', '\n\t ']) {
    assert.strictEqual(normaliseApplicationMessage(input), null, `for ${JSON.stringify(input)}`)
  }
})

test('normaliseApplicationMessage: trims but preserves inner text', () => {
  assert.strictEqual(normaliseApplicationMessage('  I can start today  '), 'I can start today')
})

test('isApplicationMessageTooLong: boundary is inclusive of the max', () => {
  const atMax = 'x'.repeat(APPLICATION_MESSAGE_MAX_LENGTH)
  assert.strictEqual(isApplicationMessageTooLong(atMax), false)
  assert.strictEqual(isApplicationMessageTooLong(`${atMax}x`), true)
  assert.strictEqual(isApplicationMessageTooLong(null), false)
})
