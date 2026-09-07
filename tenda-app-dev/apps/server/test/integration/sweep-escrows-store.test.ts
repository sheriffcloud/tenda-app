/**
 * Which escrows the sweeper is allowed to touch (#43), against real postgres.
 *
 * This is the half that decides whether the platform spends gas on someone
 * else's refund, so every boundary here is a promise to a creator: they get
 * their window, then a full day of first refusal, and nothing is swept out from
 * under a transaction they already sent.
 *
 * Deliberately NOT the bounded `[since, until)` window `expire-escrows` uses. A
 * notice is only worth sending while it is news; a sweep is worth doing
 * whenever it still has not happened, so an escrow stranded for a month must
 * still be found. The tests below pin both halves of that: old enough is found,
 * recent enough is not.
 *
 * Gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { tx_attempts } from '@tenda/shared/db/schema'
import {
  drizzleSweepEscrowsStore,
  SWEEP_BATCH_LIMIT,
  SWEEP_FIRST_REFUSAL_MS,
} from '@server/jobs/sweep-escrows'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const NOW = new Date('2026-08-30T12:00:00.000Z')
const GRACE = 3600
const CONTRACT = '0x00000000000000000000000000000000000000c1'

/** Long enough ago to be past the window AND the creator's first refusal. */
function longPast(extraMs = 0): Date {
  return new Date(NOW.getTime() - SWEEP_FIRST_REFUSAL_MS - 60_000 - extraMs)
}

function scan(app: ReturnType<typeof getApp>) {
  return drizzleSweepEscrowsStore(app.db).findSweepable({
    now: NOW,
    delay_ms: SWEEP_FIRST_REFUSAL_MS,
    grace_period_seconds: GRACE,
    limit: SWEEP_BATCH_LIMIT,
  })
}

test('an open escrow long past its accept deadline is sweepable as refund_expired', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const draft = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: longPast(),
    escrow_contract: CONTRACT,
  })

  const found = await scan(app)
  const mine = found.filter((r) => r.id === draft.id)
  assert.equal(mine.length, 1)
  assert.equal(mine[0].transition, 'refund_expired')
  assert.equal(mine[0].creator_id, creator.row.id)
  assert.equal(mine[0].escrow_contract, CONTRACT)
})

test('an escrow still inside the creator’s first refusal is NOT swept', { skip }, async () => {
  // The deadline HAS passed — the notice has already gone out — but the day
  // that belongs to the creator has not. Spending platform gas here would
  // pre-empt a refund they may be about to send themselves.
  const app = getApp()
  const creator = await createUser(app)
  const fresh = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: new Date(NOW.getTime() - SWEEP_FIRST_REFUSAL_MS + 60_000),
    escrow_contract: CONTRACT,
  })

  const found = await scan(app)
  assert.equal(found.filter((r) => r.id === fresh.id).length, 0)
})

test('an accepted escrow past completion + grace + refusal sweeps as reclaim_abandoned', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const stalled = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
    completion_deadline: longPast(GRACE * 1_000),
    escrow_contract: CONTRACT,
  })

  const found = await scan(app)
  const mine = found.filter((r) => r.id === stalled.id)
  assert.equal(mine.length, 1)
  assert.equal(mine[0].transition, 'reclaim_abandoned')
})

test('grace is respected: an accepted escrow only just past its deadline is NOT swept', { skip }, async () => {
  // The worker can still submit until completion_deadline + grace. Sweeping
  // inside that window would cancel a job that is not yet forfeit — the one
  // case where a sweep could take something from someone.
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const inGrace = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
    // Past the refusal delay measured from the deadline alone, but NOT once
    // grace is added — so only a scan that forgets grace would return it.
    completion_deadline: new Date(NOW.getTime() - SWEEP_FIRST_REFUSAL_MS - GRACE * 1_000 + 60_000),
    escrow_contract: CONTRACT,
  })

  const found = await scan(app)
  assert.equal(found.filter((r) => r.id === inGrace.id).length, 0)
})

test('an escrow with a transaction in flight is left alone', { skip }, async () => {
  // The creator may have sent their own refund seconds ago. Broadcasting a
  // second one wastes gas on a guaranteed revert and races their nonce.
  const app = getApp()
  const creator = await createUser(app)
  const busy = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: longPast(),
    escrow_contract: CONTRACT,
  })
  await app.db.insert(tx_attempts).values({
    user_id: creator.row.id,
    escrow_id: busy.id,
    action: 'refund_expired',
    tx_ref: `pending-${busy.id}`,
  })

  const found = await scan(app)
  assert.equal(found.filter((r) => r.id === busy.id).length, 0)

  // Once that attempt settles, the escrow is eligible again — a FAILED refund
  // must not park the funds forever, which is the very defect #43 exists for.
  await app.db
    .update(tx_attempts)
    .set({ failed_at: new Date(), failure_code: 'reverted' })
    .where(eq(tx_attempts.escrow_id, busy.id))
  const after = await scan(app)
  assert.equal(after.filter((r) => r.id === busy.id).length, 1)
})

test('an escrow with no pinned contract is not swept — there is nothing to call', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const unpinned = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: longPast(),
    escrow_contract: null,
  })

  const found = await scan(app)
  assert.equal(found.filter((r) => r.id === unpinned.id).length, 0)
})

test('unpinned escrows do not eat the batch budget', { skip }, async () => {
  // The narrowing filter in JS also drops these, so this is the case that tells
  // the two layers apart: only the SQL predicate stops an unpinned row from
  // consuming one of the tick's slots. With a backlog of them ahead of a real
  // candidate — they sort first, being older — a scan that filtered only in JS
  // would return NOTHING and sweep nothing, tick after tick.
  const app = getApp()
  const creator = await createUser(app)
  await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: longPast(60 * 60_000), // older, so it is ordered first
    escrow_contract: null,
  })
  const real = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: longPast(),
    escrow_contract: CONTRACT,
  })

  const found = await drizzleSweepEscrowsStore(app.db).findSweepable({
    now: NOW,
    delay_ms: SWEEP_FIRST_REFUSAL_MS,
    grace_period_seconds: GRACE,
    limit: 1,
  })
  assert.deepEqual(found.map((r) => r.id), [real.id], 'the one slot went to a sweepable escrow')
})

test('settled escrows are never swept, whatever their deadlines say', { skip }, async () => {
  // A completed escrow holds no funds and a refunded one has already paid out;
  // both keep old deadlines in their rows forever, so status is the only thing
  // separating them from a live candidate.
  const app = getApp()
  const creator = await createUser(app)
  const ids: string[] = []
  for (const status of ['completed', 'cancelled', 'refunded', 'disputed'] as const) {
    const row = await createEscrow(app, {
      creator_id: creator.row.id,
      status,
      accept_deadline: longPast(),
      completion_deadline: longPast(GRACE * 1_000),
      escrow_contract: CONTRACT,
    })
    ids.push(row.id)
  }

  const found = await scan(app)
  assert.deepEqual(found.filter((r) => ids.includes(r.id)), [])
})
