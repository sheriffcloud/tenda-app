/**
 * The application is settled by the EVENT APPLIER, atomically with the
 * transition — never by the route that builds the transaction.
 *
 * Two properties matter here and neither is visible from a unit test of the
 * pure rules:
 *   1. Assigning a live applicant stamps `assigned_from_application` and
 *      resolves every rival in the SAME commit (D4).
 *   2. Assigning WITHOUT a live application leaves the stamp false — which is
 *      what makes D2's strike rule self-correcting against a back-door assign.
 *
 * Real DB via the app's own store; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows, gig_applications } from '@tenda/shared/db/schema'
import { applyEscrowEvent, drizzleEscrowEventStore } from '@server/lib/escrow-events'
import type { DecodedEvent } from '@server/chains/types'
import { TEST_ESCROW_PROGRAM } from '../helpers/fixtures'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  makeTransactable,
  testWalletAddress,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const DEADLINE_UNIX = Math.floor(Date.now() / 1000) + 7_200

function assignedEvent(escrow_id: string, workerWallet: string, creatorWallet: string): DecodedEvent {
  return {
    name: 'CounterpartyAssigned',
    escrow_ref: 'ref-1',
    contract: TEST_ESCROW_PROGRAM,
    fields: {
      escrow_id,
      counterparty: workerWallet,
      assigned_by: creatorWallet,
      completion_deadline: String(DEADLINE_UNIX),
    },
  }
}

async function application(
  app: ReturnType<typeof getApp>,
  escrow_id: string,
  applicant_id: string,
  expires_at = new Date(Date.now() + 86_400_000),
) {
  const [row] = await app.db
    .insert(gig_applications)
    .values({ escrow_id, applicant_id, expires_at, status: 'open' })
    .returning()
  return row
}

async function statusOf(app: ReturnType<typeof getApp>, id: string): Promise<string> {
  const [row] = await app.db
    .select({ status: gig_applications.status })
    .from(gig_applications)
    .where(eq(gig_applications.id, id))
  return row?.status ?? 'missing'
}

test('assigning a live applicant stamps the escrow and passes every rival', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const rivalA = await createUser(app)
  const rivalB = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, worker.row.id)
  const creatorWallet = testWalletAddress(creator.row.id)
  const workerWallet = testWalletAddress(worker.row.id)

  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  const chosen = await application(app, escrow.id, worker.row.id)
  const lostA = await application(app, escrow.id, rivalA.row.id)
  const lostB = await application(app, escrow.id, rivalB.row.id)

  const result = await applyEscrowEvent(
    { store: drizzleEscrowEventStore(app.db), chain_ns: 'solana' },
    assignedEvent(escrow.id, workerWallet, creatorWallet),
    'sig-assign-1',
  )
  assert.strictEqual(result.applied, true)

  assert.strictEqual(await statusOf(app, chosen.id), 'assigned')
  assert.strictEqual(await statusOf(app, lostA.id), 'passed')
  assert.strictEqual(await statusOf(app, lostB.id), 'passed')

  const [row] = await app.db
    .select({
      assigned_from_application: escrows.assigned_from_application,
      counterparty_id: escrows.counterparty_id,
      status: escrows.status,
    })
    .from(escrows)
    .where(eq(escrows.id, escrow.id))
  assert.strictEqual(row.assigned_from_application, true)
  assert.strictEqual(row.counterparty_id, worker.row.id)
  assert.strictEqual(row.status, 'accepted')
})

// THE self-correcting property: a poster who assigns straight on-chain, with
// no application behind it, must not be able to manufacture strike liability
// for the worker they picked.
test('a back-door assign leaves assigned_from_application false', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, worker.row.id)
  const creatorWallet = testWalletAddress(creator.row.id)
  const workerWallet = testWalletAddress(worker.row.id)

  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  // Deliberately NO application row.
  const result = await applyEscrowEvent(
    { store: drizzleEscrowEventStore(app.db), chain_ns: 'solana' },
    assignedEvent(escrow.id, workerWallet, creatorWallet),
    'sig-assign-2',
  )
  assert.strictEqual(result.applied, true, 'the chain is still the source of truth')

  const [row] = await app.db
    .select({
      assigned_from_application: escrows.assigned_from_application,
      counterparty_id: escrows.counterparty_id,
    })
    .from(escrows)
    .where(eq(escrows.id, escrow.id))
  assert.strictEqual(row.assigned_from_application, false)
  assert.strictEqual(row.counterparty_id, worker.row.id, 'the assignment itself still lands')
})

// An application that lapsed before the transaction confirmed is not live, so
// it must not be consumed — and must not stamp the escrow either.
test('an EXPIRED application is not settled and does not stamp the escrow', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, worker.row.id)
  const creatorWallet = testWalletAddress(creator.row.id)
  const workerWallet = testWalletAddress(worker.row.id)

  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  // Already swept to `expired`; the applier only ever consumes `open` rows.
  const stale = await application(app, escrow.id, worker.row.id)
  await app.db
    .update(gig_applications)
    .set({ status: 'expired' })
    .where(eq(gig_applications.id, stale.id))

  await applyEscrowEvent(
    { store: drizzleEscrowEventStore(app.db), chain_ns: 'solana' },
    assignedEvent(escrow.id, workerWallet, creatorWallet),
    'sig-assign-3',
  )

  assert.strictEqual(await statusOf(app, stale.id), 'expired', 'untouched')
  const [row] = await app.db
    .select({ assigned_from_application: escrows.assigned_from_application })
    .from(escrows)
    .where(eq(escrows.id, escrow.id))
  assert.strictEqual(row.assigned_from_application, false)
})

// Replays hit the status guard, so the settlement must not run twice — a rival
// who was `passed` must not be re-passed, and nothing may throw.
test('a replayed assign event settles nothing further', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const rival = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, worker.row.id)
  const creatorWallet = testWalletAddress(creator.row.id)
  const workerWallet = testWalletAddress(worker.row.id)

  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  const chosen = await application(app, escrow.id, worker.row.id)
  const lost = await application(app, escrow.id, rival.row.id)

  const deps = { store: drizzleEscrowEventStore(app.db), chain_ns: 'solana' as const }
  const event = assignedEvent(escrow.id, workerWallet, creatorWallet)
  await applyEscrowEvent(deps, event, 'sig-assign-4')
  const replay = await applyEscrowEvent(deps, event, 'sig-assign-4-replay')

  // The escrow is no longer `open`, so the guard absorbs it.
  assert.strictEqual(replay.applied, false)
  assert.strictEqual(await statusOf(app, chosen.id), 'assigned')
  assert.strictEqual(await statusOf(app, lost.id), 'passed')
})

// A worker's application on a DIFFERENT gig must be untouched — the cascade is
// scoped to the escrow being assigned.
test('settlement does not reach applications on other gigs', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, worker.row.id)
  const creatorWallet = testWalletAddress(creator.row.id)
  const workerWallet = testWalletAddress(worker.row.id)

  const target = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  const other = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  const here = await application(app, target.id, worker.row.id)
  const elsewhere = await application(app, other.id, worker.row.id)

  await applyEscrowEvent(
    { store: drizzleEscrowEventStore(app.db), chain_ns: 'solana' },
    assignedEvent(target.id, workerWallet, creatorWallet),
    'sig-assign-5',
  )

  assert.strictEqual(await statusOf(app, here.id), 'assigned')
  assert.strictEqual(await statusOf(app, elsewhere.id), 'open', 'other gigs are untouched')
})
