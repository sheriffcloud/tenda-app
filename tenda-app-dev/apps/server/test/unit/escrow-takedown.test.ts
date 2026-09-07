/**
 * The CO1 takedown gate (`lib/escrow/takedown.ts`).
 *
 * Two things are worth testing here and neither is "does it throw on accept".
 *
 * The first is the ALLOW list. A taken-down escrow can be holding funds locked
 * on-chain, so every exit — submit, approve, cancel, refund, dispute, resolve —
 * has to survive the takedown. A gate that over-blocks strands real money, and
 * it does so silently, because the person it strands is a party who was doing
 * nothing wrong.
 *
 * The second is the TRANSITION MAP. `publish` and `create` are the same act
 * under two vocabularies, and the state machine speaks the one the shared
 * policy table does not. A map that quietly answered `undefined` for a
 * transition would make `isBlockedByTakedown` return false and the gate a
 * no-op — passing every "does it block accept" test while leaking everything
 * else.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode } from '@tenda/shared'
import type { EscrowTransition } from '@server/lib/escrow'
import { assertNotTakenDown, takedownActionFor } from '@server/lib/escrow'
import { AppError } from '@server/lib/errors'

const VISIBLE = { hidden: false }
const HIDDEN = { hidden: true }

/** Every transition the state machine has. Listed, so a new one fails here. */
const ALL_TRANSITIONS: readonly EscrowTransition[] = [
  'publish',
  'accept',
  'decline',
  'assign_accept',
  'unassign',
  'submit',
  'approve',
  'claim_stalled',
  'cancel',
  'refund_expired',
  'reclaim_abandoned',
  'dispute',
  'resolve',
]

const BLOCKED_TRANSITIONS: readonly EscrowTransition[] = ['publish', 'accept', 'assign_accept']

function refusal(fn: () => void): AppError {
  try {
    fn()
  } catch (e) {
    assert.ok(e instanceof AppError, 'expected an AppError')
    return e
  }
  return assert.fail('expected the gate to refuse')
}

test('takedown gate: a VISIBLE escrow permits every transition', () => {
  for (const t of ALL_TRANSITIONS) {
    assert.doesNotThrow(
      () => assertNotTakenDown(VISIBLE, takedownActionFor(t)),
      `${t} must be untouched on a visible escrow`,
    )
  }
})

test('takedown gate: a HIDDEN escrow refuses only the ways IN', () => {
  for (const t of BLOCKED_TRANSITIONS) {
    const err = refusal(() => assertNotTakenDown(HIDDEN, takedownActionFor(t)))
    assert.strictEqual(err.statusCode, 409, `${t} should be a 409`)
    assert.strictEqual(err.code, ErrorCode.ESCROW_TAKEN_DOWN, `${t} code`)
    assert.ok(err.message.length > 0, `${t} message`)
  }
})

test('takedown gate: a HIDDEN escrow keeps EVERY way out', () => {
  // The half that protects locked funds. Derived from the full list rather
  // than hand-copied, so a transition added to ALL_TRANSITIONS is asserted by
  // one of the two tests without anyone remembering to add it twice.
  const exits = ALL_TRANSITIONS.filter((t) => !BLOCKED_TRANSITIONS.includes(t))
  assert.ok(exits.length > 0)
  for (const t of exits) {
    assert.doesNotThrow(
      () => assertNotTakenDown(HIDDEN, takedownActionFor(t)),
      `${t} must survive a takedown — its escrow may hold locked funds`,
    )
  }
})

test('takedownActionFor: publish IS create, and nothing maps to undefined', () => {
  // The one non-identity entry, and the reason the map exists at all: the
  // state machine calls it `publish`, the wire and the policy table call it
  // `create`. Mapped wrong, a hidden draft could still be funded.
  assert.strictEqual(takedownActionFor('publish'), 'create')
  for (const t of ALL_TRANSITIONS) {
    assert.strictEqual(typeof takedownActionFor(t), 'string', `${t} has no mapping`)
  }
})

test('takedown gate: apply is blocked though it has no transition behind it', () => {
  // Applications never reach `guardTransition` — the route calls the gate
  // directly — so the action has to be reachable without a transition name.
  const err = refusal(() => assertNotTakenDown(HIDDEN, 'apply'))
  assert.strictEqual(err.code, ErrorCode.ESCROW_TAKEN_DOWN)
  assert.doesNotThrow(() => assertNotTakenDown(VISIBLE, 'apply'))
})
