/**
 * #98 — ADVERSARIAL (concurrency/atomicity): applyEvent must commit the
 * status transition + the escrow_transactions audit row in ONE transaction.
 * verify-tx's isProcessed dedup keys on that audit row, so if the transition
 * could commit while the audit insert fails, the escrow would advance with a
 * lost audit row and broken idempotency.
 *
 * We force the audit insert to fail (a ghost actor_id violates the
 * escrow_transactions.actor_id → users FK) and assert the transition rolled
 * back. Against the pre-fix code (separate awaits) the status would have
 * advanced to 'submitted' with the insert failing independently.
 *
 * Real DB via the harness; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows, escrow_transactions } from '@tenda/shared/db/schema/escrow'
import { user_wallets } from '@tenda/shared/db/schema/identity'
import { drizzleEscrowEventStore } from '@server/lib/escrow-events'
import { TEST_DB_CONFIGURED, useTestApp, createUser, createEscrow } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const GHOST_USER = '00000000-0000-0000-0000-0000000000ff' // not a real user → FK violation

test('applyEvent: a failed audit insert rolls back the status transition', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'accepted',
  })
  const store = drizzleEscrowEventStore(app.db)
  const tx_ref = `atomic-${escrow.id}`

  await assert.rejects(
    store.applyEvent({
      escrow_id: escrow.id,
      from: ['accepted'],
      patch: { status: 'submitted' },
      transaction: {
        type: 'submit', tx_ref, amount_raw: null, platform_fee_raw: null, creator_payout_raw: null,
        actor_id: GHOST_USER, // FK violation → forces the insert to throw
      },
    }),
    'the audit insert must throw on the ghost actor_id',
  )

  const [row] = await app.db.select({ status: escrows.status }).from(escrows).where(eq(escrows.id, escrow.id))
  assert.strictEqual(row?.status, 'accepted', 'status must roll back when the audit insert fails')

  const audit = await app.db.select().from(escrow_transactions).where(eq(escrow_transactions.tx_ref, tx_ref))
  assert.strictEqual(audit.length, 0, 'no orphan audit row')
})

test('applyEvent: the happy path transitions and writes the audit row together', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'accepted',
  })
  const store = drizzleEscrowEventStore(app.db)
  const tx_ref = `ok-${escrow.id}`

  const outcome = await store.applyEvent({
    escrow_id: escrow.id,
    from: ['accepted'],
    patch: { status: 'submitted' },
    transaction: { type: 'submit', tx_ref, amount_raw: null, platform_fee_raw: null, creator_payout_raw: null, actor_id: worker.row.id },
  })
  assert.strictEqual(outcome.applied, true)

  const [row] = await app.db.select({ status: escrows.status }).from(escrows).where(eq(escrows.id, escrow.id))
  assert.strictEqual(row?.status, 'submitted')
  const audit = await app.db.select().from(escrow_transactions).where(eq(escrow_transactions.tx_ref, tx_ref))
  assert.strictEqual(audit.length, 1)
})

test('applyEvent: a tripped status guard writes nothing (idempotent no-op)', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  // status is 'open' but we guard on ['accepted'] → guard trips
  const escrow = await createEscrow(app, { creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'open' })
  const store = drizzleEscrowEventStore(app.db)
  const tx_ref = `noop-${escrow.id}`

  const outcome = await store.applyEvent({
    escrow_id: escrow.id,
    from: ['accepted'],
    patch: { status: 'submitted' },
    transaction: { type: 'submit', tx_ref, amount_raw: null, platform_fee_raw: null, creator_payout_raw: null, actor_id: worker.row.id },
  })
  assert.strictEqual(outcome.applied, false)
  const audit = await app.db.select().from(escrow_transactions).where(eq(escrow_transactions.tx_ref, tx_ref))
  assert.strictEqual(audit.length, 0, 'no audit row when the guard trips')
})

test('resolveUserByWallet: a checksummed on-chain EVM address resolves the row regardless of stored case', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const store = drizzleEscrowEventStore(app.db)
  // A legacy row stored MIXED-CASE; event-decoded addresses arrive EIP-55
  // checksummed — the lookup must fold case on both sides to attribute it.
  const mixed = '0xAbC0000000000000000000000000000000000fed'
  await app.db
    .insert(user_wallets)
    .values({ chain_ns: 'eip155', address: mixed, user_id: u.row.id, is_primary: false })
  assert.strictEqual(await store.resolveUserByWallet('eip155', mixed.toLowerCase()), u.row.id)
  assert.strictEqual(await store.resolveUserByWallet('eip155', mixed.toUpperCase()), u.row.id)
  // An unknown wallet resolves to null (negative).
  assert.strictEqual(
    await store.resolveUserByWallet('eip155', '0x0000000000000000000000000000000000000001'),
    null,
  )
})
