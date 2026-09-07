/**
 * The wallet feed's visibility matrix. These tests pin the properties the SQL
 * predicate and the mobile renderer both silently depend on — a matrix change
 * that breaks either one fails here first.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TX_FEED_VISIBILITY,
  ACTOR_SCOPED_FEED_TX_TYPES,
  feedTxTypesFor,
} from '../../src/constants/escrow-feed'
import { ESCROW_TX_TYPES } from '../../src/constants/escrow'

const ROLES = ['creator', 'counterparty'] as const

test('the matrix is TOTAL over ESCROW_TX_TYPES — no missing and no stray keys', () => {
  const keys = Object.keys(TX_FEED_VISIBILITY).sort()
  assert.deepEqual(keys, [...ESCROW_TX_TYPES].sort())
})

test('every cell is a declared visibility, for both roles', () => {
  for (const type of ESCROW_TX_TYPES) {
    for (const role of ROLES) {
      assert.ok(
        ['always', 'actor', 'never'].includes(TX_FEED_VISIBILITY[type][role]),
        `${type}.${role} is not a declared visibility`,
      )
    }
  }
})

/**
 * A role whose `always` set is empty would compile to `inArray(col, [])` —
 * a constant FALSE — silently emptying that side of the feed instead of
 * failing. Both sides must always have content.
 */
test('both roles have a non-empty always-set', () => {
  for (const role of ROLES) {
    assert.ok(feedTxTypesFor(role).length > 0, `${role} has no always-visible types`)
  }
})

test('feedTxTypesFor returns exactly the always cells for that role', () => {
  for (const role of ROLES) {
    const derived = feedTxTypesFor(role)
    const expected = ESCROW_TX_TYPES.filter((t) => TX_FEED_VISIBILITY[t][role] === 'always')
    assert.deepEqual(derived, [...expected])
    // and nothing actor-scoped or hidden leaked in
    for (const type of derived) assert.equal(TX_FEED_VISIBILITY[type][role], 'always')
  }
})

/**
 * `dispute` is the only transition either party can perform (`raised_by`), so
 * it is the only one that needs the actor_id check. Anything else marked
 * `actor` would be scoped by a column that is NULL far more often than it
 * looks — see the file header on escrow-feed.ts.
 */
test('dispute is the ONLY actor-scoped type', () => {
  assert.deepEqual([...ACTOR_SCOPED_FEED_TX_TYPES], ['dispute'])
})

/**
 * The trap this whole design exists to avoid: DisputeResolved declares no
 * actor_field, so every `resolve` row has actor_id NULL. Marking it `actor`
 * would hide the dispute payout — the most consequential row in the feed —
 * from both parties.
 */
test('resolve is always-visible to BOTH parties, never actor-scoped', () => {
  assert.equal(TX_FEED_VISIBILITY.resolve.creator, 'always')
  assert.equal(TX_FEED_VISIBILITY.resolve.counterparty, 'always')
})

test('the settlement credits the summary sums are visible to the counterparty', () => {
  // /v1/users/:id/transactions/summary derives earned_raw from exactly these
  // three types where the caller is counterparty. If the feed hid any of
  // them, the wallet would show an "Earned" total with no rows behind it.
  for (const type of ['approve', 'claim_stalled', 'resolve'] as const) {
    assert.notEqual(TX_FEED_VISIBILITY[type].counterparty, 'never')
  }
  // Same for spent_raw, which is `create` where the caller is creator.
  assert.equal(TX_FEED_VISIBILITY.create.creator, 'always')
})

test('the agreed poster/worker split, cell by cell', () => {
  assert.deepEqual(feedTxTypesFor('creator'), [
    'create',
    'assign_accept',
    'unassign',
    'approve',
    'cancel',
    'refund_expired',
    'reclaim_abandoned',
    'resolve',
  ])
  assert.deepEqual(feedTxTypesFor('counterparty'), [
    'accept',
    'assign_accept',
    'submit',
    'approve',
    'claim_stalled',
    'resolve',
  ])
})

test('a worker never sees the funding row, a poster never sees the work rows', () => {
  assert.equal(TX_FEED_VISIBILITY.create.counterparty, 'never')
  assert.equal(TX_FEED_VISIBILITY.accept.creator, 'never')
  assert.equal(TX_FEED_VISIBILITY.submit.creator, 'never')
})
