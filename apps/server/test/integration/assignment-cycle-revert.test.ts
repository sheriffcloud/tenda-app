/**
 * An `unassign` must undo the whole assignment cycle, not just the status.
 *
 * `assign_accept` writes state in THREE places — the escrow row, the winner's
 * application, and every rival's — and only the first was being rewound. Every
 * symptom that produced is asserted here, because none of them is visible from
 * the escrow's status alone:
 *
 *   - the released worker kept reading "You got this gig — it's yours to
 *     deliver" above an Apply button, because their row was still `assigned`;
 *   - the poster kept seeing "your worker said they are not available" against
 *     the NEXT worker, because `assignment_released_at` was never cleared;
 *   - that stale stamp also dropped the gig out of the new worker's active-gig
 *     cap and suppressed their abandonment strike for the life of the escrow.
 *
 * Real DB via the app's own store; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows, gig_applications } from '@tenda/shared/db/schema'
import { applyEscrowEvent, drizzleEscrowEventStore } from '@server/lib/escrow-events'
import { drizzleCapacityStore } from '@server/features/capacity/store'
import { signalsFor } from '@server/features/reputation/signals'
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

const NOW = new Date()
const HOUR = 3_600_000
const DEADLINE_UNIX = Math.floor(NOW.getTime() / 1000) + 7_200

function assignedEvent(escrow_id: string, worker: string, creator: string): DecodedEvent {
  return {
    name: 'CounterpartyAssigned',
    escrow_ref: 'ref-cycle',
    contract: TEST_ESCROW_PROGRAM,
    fields: {
      escrow_id,
      counterparty: worker,
      assigned_by: creator,
      completion_deadline: String(DEADLINE_UNIX),
    },
  }
}

function releasedEvent(escrow_id: string, worker: string, creator: string): DecodedEvent {
  return {
    name: 'AssignmentReleased',
    escrow_ref: 'ref-cycle',
    contract: TEST_ESCROW_PROGRAM,
    fields: { escrow_id, counterparty: worker, released_by: creator },
  }
}

type App = ReturnType<typeof getApp>

async function application(
  app: App,
  escrow_id: string,
  applicant_id: string,
  expires_at = new Date(NOW.getTime() + 24 * HOUR),
) {
  const [row] = await app.db
    .insert(gig_applications)
    .values({ escrow_id, applicant_id, expires_at, status: 'open' })
    .returning()
  return row
}

async function statusOf(app: App, id: string): Promise<string> {
  const [row] = await app.db
    .select({ status: gig_applications.status })
    .from(gig_applications)
    .where(eq(gig_applications.id, id))
  return row?.status ?? 'missing'
}

async function escrowRow(app: App, id: string) {
  const [row] = await app.db
    .select({
      status: escrows.status,
      counterparty_id: escrows.counterparty_id,
      assignment_released_at: escrows.assignment_released_at,
      assigned_from_application: escrows.assigned_from_application,
    })
    .from(escrows)
    .where(eq(escrows.id, id))
  return row
}

const store = (app: App) => ({ store: drizzleEscrowEventStore(app.db), chain_ns: 'solana' as const })

/**
 * `escrow_transactions.tx_ref` is UNIQUE and the insert is
 * onConflictDoNothing, so a reused ref would drop an audit row SILENTLY while
 * the transition still applied. A counter, not a timestamp: two cycles at the
 * same `now` are exactly what a re-assignment test does.
 */
let txRefSeq = 0
const nextTxRef = (label: string) => `sig-${label}-${++txRefSeq}`

/** Assign `worker`, having stamped the off-chain release, then unassign. */
async function cycleOnce(
  app: App,
  escrow_id: string,
  worker: string,
  creator: string,
  { release = true, now = NOW }: { release?: boolean; now?: Date } = {},
) {
  await applyEscrowEvent(store(app), assignedEvent(escrow_id, worker, creator), nextTxRef('a'), now)
  if (release) {
    await app.db
      .update(escrows)
      .set({ assignment_released_at: now })
      .where(eq(escrows.id, escrow_id))
  }
  return applyEscrowEvent(store(app), releasedEvent(escrow_id, worker, creator), nextTxRef('r'), now)
}

test('unassign reverts the escrow row, not just its status', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, worker.row.id)

  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  await application(app, escrow.id, worker.row.id)

  const result = await cycleOnce(
    app,
    escrow.id,
    testWalletAddress(worker.row.id),
    testWalletAddress(creator.row.id),
  )
  assert.strictEqual(result.applied, true)

  const row = await escrowRow(app, escrow.id)
  assert.strictEqual(row.status, 'open')
  assert.strictEqual(row.counterparty_id, null)
  // The two that were never being cleared.
  assert.strictEqual(row.assignment_released_at, null)
  assert.strictEqual(row.assigned_from_application, false)
})

test('the released worker reads as released, never as still assigned', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, worker.row.id)

  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  const theirs = await application(app, escrow.id, worker.row.id)

  await cycleOnce(app, escrow.id, testWalletAddress(worker.row.id), testWalletAddress(creator.row.id))

  // Not `assigned` (which rendered "You got this gig" above an Apply button),
  // and not `withdrawn` either — the poster let them go, they did not leave.
  assert.strictEqual(await statusOf(app, theirs.id), 'released')
})

test('rivals who lost to a worker who fell through get their shot back', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const live = await createUser(app)
  const lapsed = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, worker.row.id)

  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  await application(app, escrow.id, worker.row.id)
  const liveRival = await application(app, escrow.id, live.row.id)
  // Expires DURING the assignment: reviving it would re-arm D2's strike for
  // someone who applied long ago and moved on, which `isAssignable` refuses.
  const lapsedRival = await application(app, escrow.id, lapsed.row.id, new Date(NOW.getTime() + HOUR))

  const result = await cycleOnce(
    app,
    escrow.id,
    testWalletAddress(worker.row.id),
    testWalletAddress(creator.row.id),
    { now: new Date(NOW.getTime() + 2 * HOUR) },
  )

  assert.strictEqual(await statusOf(app, liveRival.id), 'open')
  assert.strictEqual(await statusOf(app, lapsedRival.id), 'passed')
  // Carried out so the fan-out reaches exactly these people, and only once.
  assert.deepStrictEqual(result.revived_applicant_ids, [live.row.id])
})

test('revives nobody once the gig has stopped taking workers', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const rival = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, worker.row.id)

  // Past `accept_deadline` the poster cannot assign ANYONE — the escrow is on
  // the refund path — so a revived row would be a dead application quietly
  // occupying one of the applicant's slots.
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
    accept_deadline: new Date(NOW.getTime() - HOUR),
  })
  await application(app, escrow.id, worker.row.id)
  const loser = await application(app, escrow.id, rival.row.id)

  const result = await cycleOnce(
    app,
    escrow.id,
    testWalletAddress(worker.row.id),
    testWalletAddress(creator.row.id),
  )

  assert.strictEqual(await statusOf(app, loser.id), 'passed')
  assert.deepStrictEqual(result.revived_applicant_ids, [])
})

test('a re-assigned worker is a clean slate: capacity counts, strike applies', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const first = await createUser(app)
  const second = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, first.row.id)
  await makeTransactable(app, second.row.id)
  const creatorWallet = testWalletAddress(creator.row.id)

  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    requires_approval: true,
  })
  await application(app, escrow.id, first.row.id)
  await application(app, escrow.id, second.row.id)

  // Cycle one: the first worker says they are not available, poster unassigns.
  await cycleOnce(app, escrow.id, testWalletAddress(first.row.id), creatorWallet)

  // Cycle two: the second worker is assigned.
  await applyEscrowEvent(
    store(app),
    assignedEvent(escrow.id, testWalletAddress(second.row.id), creatorWallet),
    nextTxRef('assign2'),
    NOW,
  )

  const row = await escrowRow(app, escrow.id)
  assert.strictEqual(row.counterparty_id, second.row.id)
  // The stale stamp is what made all three of the following wrong.
  assert.strictEqual(row.assignment_released_at, null)
  assert.strictEqual(row.assigned_from_application, true)

  // It counts against their cap again (it was being skipped entirely).
  const active = await drizzleCapacityStore(app.db).countActiveGigs(second.row.id, NOW, 3600)
  assert.strictEqual(active, 1)

  // And an abandonment now earns the strike it should (it was suppressed).
  const signals = signalsFor('escrow.abandoned', {
    parties: { creator_id: creator.row.id, counterparty_id: second.row.id },
    requires_approval: true,
    assigned_from_application: row.assigned_from_application,
    assignment_released: row.assignment_released_at !== null,
  })
  assert.deepStrictEqual(
    signals.map((s) => s.kind),
    ['abandoned'],
  )
})

test('a replayed unassign reverts nothing a second time', { skip }, async () => {
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
  await application(app, escrow.id, worker.row.id)
  const loser = await application(app, escrow.id, rival.row.id)

  await cycleOnce(app, escrow.id, workerWallet, creatorWallet)

  // The status guard trips (`from: ['accepted']`, the escrow is already open),
  // so the whole apply — including the revert — must be an idempotent no-op.
  const replay = await applyEscrowEvent(
    store(app),
    releasedEvent(escrow.id, workerWallet, creatorWallet),
    nextTxRef('replay'),
    NOW,
  )
  assert.strictEqual(replay.applied, false)
  assert.deepStrictEqual(replay.revived_applicant_ids, [])
  // Still open from the FIRST revert, not revived twice (which would have
  // notified the same applicant again).
  assert.strictEqual(await statusOf(app, loser.id), 'open')
})
