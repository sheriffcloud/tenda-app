/**
 * features/capacity — the pure boundary decision and its refusal copy.
 *
 * The interesting cases are the edges: exactly at the limit (blocked), one
 * under (allowed), and OVER the limit, which is reachable in production even
 * though it looks impossible — an operator can lower `max_pending_gigs`, and a
 * hand-crafted `acceptEscrow` bypasses this guard entirely while the event
 * applier still records it, because the DB mirrors the chain.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared'
import {
  checkGigCapacity,
  capacityMessage,
  workerCapacityMessage,
} from '@server/features/capacity/service'

// ---------- boundaries ------------------------------------------------------

test('an idle worker has the full allowance', () => {
  assert.deepStrictEqual(checkGigCapacity(0, 2), {
    allowed: true,
    active: 0,
    limit: 2,
    remaining: 2,
  })
})

test('one under the limit is allowed', () => {
  const check = checkGigCapacity(1, 2)
  assert.strictEqual(check.allowed, true)
  assert.strictEqual(check.remaining, 1)
})

test('exactly at the limit is blocked', () => {
  const check = checkGigCapacity(2, 2)
  assert.strictEqual(check.allowed, false)
  assert.strictEqual(check.remaining, 0)
})

test('over the limit is blocked and never reports negative headroom', () => {
  const check = checkGigCapacity(5, 2)
  assert.strictEqual(check.allowed, false)
  assert.strictEqual(check.remaining, 0)
  assert.strictEqual(check.active, 5)
})

test('a limit of 1 blocks the second concurrent gig', () => {
  assert.strictEqual(checkGigCapacity(0, 1).allowed, true)
  assert.strictEqual(checkGigCapacity(1, 1).allowed, false)
})

test('a large configured limit still permits work', () => {
  assert.strictEqual(checkGigCapacity(99, 100).allowed, true)
  assert.strictEqual(checkGigCapacity(100, 100).allowed, false)
})

test('the shipped default blocks the third concurrent gig', () => {
  const limit = PLATFORM_CONFIG_DEFAULTS.max_pending_gigs
  assert.strictEqual(checkGigCapacity(limit - 1, limit).allowed, true)
  assert.strictEqual(checkGigCapacity(limit, limit).allowed, false)
})

// ---------- refusal copy ----------------------------------------------------

test('the message states the limit, the current load, and the way out', () => {
  const msg = capacityMessage(checkGigCapacity(2, 2))
  assert.match(msg, /2 gigs at a time/)
  assert.match(msg, /2 active gigs/)
  assert.match(msg, /Finish or submit/)
})

test('the message singularises a limit of one', () => {
  const msg = capacityMessage(checkGigCapacity(1, 1))
  assert.match(msg, /1 gig at a time/)
  assert.doesNotMatch(msg, /1 gigs/)
})

test('the message reports the real load when it exceeds the limit', () => {
  assert.match(capacityMessage(checkGigCapacity(4, 2)), /4 active gigs/)
})

// ---------- poster-facing wording (the assign path) --------------------------
// `assign` enforces the cap against the WORKER while the POSTER is the caller,
// so it needs its own copy. Reusing the second-person message there would tell
// a poster *they* were at capacity.

test('workerCapacityMessage: third person, and never addresses the reader', () => {
  const msg = workerCapacityMessage(checkGigCapacity(2, 2))
  assert.match(msg, /this worker/i)
  // The give-away that the wrong message leaked through.
  assert.doesNotMatch(msg, /\byou\b/i)
})

test('workerCapacityMessage: reports the same numbers as the check', () => {
  const check = checkGigCapacity(3, 2)
  const msg = workerCapacityMessage(check)
  assert.match(msg, /3 active gigs/)
  assert.match(msg, /limit is 2 gigs/)
})

test('workerCapacityMessage: singular reads correctly on both counts', () => {
  const msg = workerCapacityMessage(checkGigCapacity(1, 1))
  assert.match(msg, /1 active gig\b/)
  assert.match(msg, /limit is 1 gig\b/)
  assert.doesNotMatch(msg, /gigs/)
})

test('the two messages differ — one predicate must not yield one wording', () => {
  const check = checkGigCapacity(2, 2)
  assert.notStrictEqual(capacityMessage(check), workerCapacityMessage(check))
})
