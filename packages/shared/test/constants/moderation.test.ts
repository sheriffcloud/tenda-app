import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REPORT_CONTENT_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_REASON_LABEL,
  isBlockedByTakedown,
  TAKEDOWN_REFUSED_MESSAGE,
} from '../../src/constants/moderation'
import { ESCROW_TX_TYPES } from '../../src/constants/escrow'

test('report enums are non-empty and duplicate-free', () => {
  for (const list of [REPORT_CONTENT_TYPES, REPORT_REASONS, REPORT_STATUSES]) {
    assert.ok(list.length > 0)
    assert.equal(new Set(list).size, list.length)
  }
})

test('REPORT_REASON_LABEL: has a non-empty label for every reason and no extras', () => {
  const labelKeys = Object.keys(REPORT_REASON_LABEL).sort()
  assert.deepEqual(labelKeys, [...REPORT_REASONS].sort())
  for (const reason of REPORT_REASONS) {
    assert.ok(REPORT_REASON_LABEL[reason].length > 0, `${reason} label`)
  }
})

// ── CO1 takedown policy ────────────────────────────────────────────────────
//
// The table is the contract between the server (which enforces it) and the
// client (which stops offering the button). What these guard is not the four
// blocked names — those are obvious — but the ALLOWED half: a taken-down escrow
// may hold funds locked on-chain, so quietly blocking an exit would strand real
// money with no way to reach it.

/** Every action a takedown has an opinion about, as the wire names them. */
const ALL_ACTIONS = [...ESCROW_TX_TYPES, 'apply' as const]

/** The ways IN. Written down, so the partition test below has something to
 *  compare the live answers against. */
const BLOCKED = ['accept', 'apply', 'assign_accept', 'create'] as const

/**
 * The ways OUT. Named individually rather than derived as "the rest": derived,
 * a newly added tx type would join this list silently and be asserted to be an
 * exit by the very test that was supposed to notice nobody had classified it.
 */
const EXITS = [
  'decline',
  'unassign',
  'submit',
  'approve',
  'claim_stalled',
  'cancel',
  'refund_expired',
  'reclaim_abandoned',
  'dispute',
  'resolve',
] as const

test('TAKEDOWN: blocks exactly the ways IN', () => {
  const blocked = ALL_ACTIONS.filter((a) => isBlockedByTakedown(a))
  assert.deepEqual(blocked.sort(), [...BLOCKED].sort())
})

test('TAKEDOWN: every way OUT stays open', () => {
  for (const action of EXITS) {
    assert.equal(isBlockedByTakedown(action), false, `${action} must survive a takedown`)
  }
})

test('TAKEDOWN: the two lists PARTITION the vocabulary — nothing unclassified', () => {
  // This replaces a `typeof … === 'boolean'` sweep that could not fail: an
  // action missing from the table reads `undefined === 'blocked'` → false, so
  // the old assertion held for keys that did not exist, and the value it held
  // for was "allowed". Verified by calling the predicate with a bogus key.
  //
  // The partition is the assertion that actually bites. A tx type added to the
  // shared vocabulary and forgotten here fails BOTH ways: it is absent from
  // BLOCKED ∪ EXITS, and the sorted comparison names it.
  assert.deepEqual(
    [...BLOCKED, ...EXITS].sort(),
    [...ALL_ACTIONS].sort(),
    'every action must be written down as exactly one of blocked / exit',
  )
  // No overlap check: the two lists are `as const`, so an action appearing in
  // both makes the comparison a TS2367 compile error before any test runs. A
  // runtime assertion for it would be dead code that only looks thorough —
  // which is the same failure this test was rewritten to remove.
})

test('TAKEDOWN_REFUSED_MESSAGE: explains the refusal without naming the reason', () => {
  // Shown to strangers whose screen simply went stale; the moderation reason is
  // between the reporter and the admin.
  assert.ok(TAKEDOWN_REFUSED_MESSAGE.length > 0)
  assert.ok(!/report|moderat|abuse|fraud/i.test(TAKEDOWN_REFUSED_MESSAGE))
})
