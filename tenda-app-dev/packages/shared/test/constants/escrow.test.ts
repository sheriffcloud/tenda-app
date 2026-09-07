import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESCROW_TX_TYPES,
  isEscrowTxType,
  DEFAULT_ACCEPT_WINDOW_SECONDS,
  AMOUNT_RAW_PRECISION,
  POSTED_ESCROW_STATUSES,
} from '../../src/constants/escrow'
import { escrowStatusEnum } from '../../src/db/schema/escrow'

test('ESCROW_TX_TYPES: non-empty and free of duplicates', () => {
  assert.ok(ESCROW_TX_TYPES.length > 0)
  assert.equal(new Set(ESCROW_TX_TYPES).size, ESCROW_TX_TYPES.length)
})

test('isEscrowTxType: accepts every declared type', () => {
  for (const t of ESCROW_TX_TYPES) assert.equal(isEscrowTxType(t), true)
})

test('isEscrowTxType: rejects unknown strings and non-strings', () => {
  assert.equal(isEscrowTxType('teleport'), false)
  assert.equal(isEscrowTxType(''), false)
  assert.equal(isEscrowTxType(42), false)
  assert.equal(isEscrowTxType(null), false)
  assert.equal(isEscrowTxType(undefined), false)
})

test('DEFAULT_ACCEPT_WINDOW_SECONDS equals 7 days', () => {
  assert.equal(DEFAULT_ACCEPT_WINDOW_SECONDS, 7 * 24 * 60 * 60)
})

test('AMOUNT_RAW_PRECISION matches the numeric(78,0) column precision', () => {
  assert.equal(AMOUNT_RAW_PRECISION, 78)
})

/**
 * POSTED_ESCROW_STATUSES is an alias of the on-chain status order, which is
 * only correct while `draft` is the sole off-chain status. Adding a status to
 * the DB enum without deciding whether it counts as "posted" fails HERE
 * rather than silently mis-counting the My Gigs / profile totals.
 */
test('POSTED_ESCROW_STATUSES is exactly the DB enum minus draft', () => {
  const expected = escrowStatusEnum.enumValues.filter((s) => s !== 'draft')
  assert.deepEqual([...POSTED_ESCROW_STATUSES].sort(), [...expected].sort())
})

test('POSTED_ESCROW_STATUSES excludes draft — the whole point of the filter', () => {
  assert.equal((POSTED_ESCROW_STATUSES as readonly string[]).includes('draft'), false)
  assert.equal(new Set(POSTED_ESCROW_STATUSES).size, POSTED_ESCROW_STATUSES.length)
})
