/**
 * features/alerts/kinds/dispute-raised — resolving a queued ref into the facts
 * a channel renders.
 *
 * An integration test rather than a fake store, deliberately: every claim this
 * resolver makes is a claim about what postgres returns from four tables joined
 * three ways. A stub would assert the query I wrote, not the rows the database
 * produces — and the whole point of the LEFT JOINs is what comes back when a
 * row is ABSENT, which is exactly what a stub cannot tell me.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { disputes } from '@tenda/shared/db/schema'
import { escrow_transactions } from '@tenda/shared/db/schema/escrow'
import { resolveDisputeRaised } from '@server/features/alerts/kinds/dispute-raised'
import { resolveAlert, ALERT_KINDS, type AlertRef } from '@server/features/alerts'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
  type TestUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

let creator: TestUser
let worker: TestUser

beforeEach(async () => {
  if (skip) return
  creator = await createUser(getApp())
  worker = await createUser(getApp())
})

function refFor(escrow_id: string, tx_ref: string): Extract<AlertRef, { kind: 'dispute.raised' }> {
  return { kind: 'dispute.raised', escrow_id, tx_ref }
}

/** A disputed gig escrow with its on-chain transaction row. */
async function disputedGig(opts: { actor_id?: string | null; title?: string } = {}) {
  const app = getApp()
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'disputed',
  })
  await attachGigDetails(app, escrow.id, { title: opts.title ?? 'Fix the roof' })
  const tx_ref = `sig-${randomUUID()}`
  await app.db.insert(escrow_transactions).values({
    escrow_id: escrow.id,
    type: 'dispute',
    tx_ref,
    actor_id: opts.actor_id === undefined ? worker.row.id : opts.actor_id,
  })
  return { escrow, tx_ref }
}

async function raiseTriageRow(escrow_id: string, raised_by: string, reason = 'Work not delivered') {
  await getApp().db.insert(disputes).values({ escrow_id, raised_by, reason })
}

// ---------- the happy path ----------------------------------------------------

test('resolves the full fact set from escrow + dispute + gig + tx', { skip }, async () => {
  const { escrow, tx_ref } = await disputedGig({ title: 'Fix the roof' })
  await raiseTriageRow(escrow.id, worker.row.id, 'Work not delivered')

  const alert = await resolveDisputeRaised(getApp().db, refFor(escrow.id, tx_ref))

  assert.ok(alert !== null)
  assert.strictEqual(alert.kind, 'dispute.raised')
  assert.strictEqual(alert.escrow_id, escrow.id)
  assert.strictEqual(alert.tx_ref, tx_ref)
  assert.strictEqual(alert.escrow_kind, 'gig')
  assert.strictEqual(alert.escrow_title, 'Fix the roof')
  assert.strictEqual(alert.reason, 'Work not delivered')
  assert.strictEqual(alert.raised_by_id, worker.row.id)
  assert.strictEqual(alert.creator_id, creator.row.id)
  assert.strictEqual(alert.counterparty_id, worker.row.id)
  assert.ok(alert.dispute_id !== null)
})

// ---------- EDGE G1: no triage row --------------------------------------------

test('G1: a dispute with NO triage row still resolves, degraded not skipped', { skip }, async () => {
  // The contract is public and reconcile picks up transactions the app never
  // issued, so the on-chain dispute can exist with nothing from POST /dispute.
  // Returning null here would mean the disputes nobody filed correctly are the
  // ones nobody hears about.
  const { escrow, tx_ref } = await disputedGig()

  const alert = await resolveDisputeRaised(getApp().db, refFor(escrow.id, tx_ref))

  assert.ok(alert !== null, 'an unfiled dispute is the case that most needs a human')
  assert.strictEqual(alert.dispute_id, null)
  assert.strictEqual(alert.reason, null)
  // Recovered from the transaction's chain-attested actor.
  assert.strictEqual(alert.raised_by_id, worker.row.id)
  // The rest is intact — degraded means fewer facts, not fewer fields.
  assert.strictEqual(alert.escrow_title, 'Fix the roof')
  assert.strictEqual(alert.creator_id, creator.row.id)
})

test('G1: no triage row AND an unknown actor wallet leaves the raiser null', { skip }, async () => {
  // applyEscrowEvent stores actor_id null when the on-chain wallet maps to no
  // user. Both sources are then empty; the alert must still go out.
  const { escrow, tx_ref } = await disputedGig({ actor_id: null })

  const alert = await resolveDisputeRaised(getApp().db, refFor(escrow.id, tx_ref))

  assert.ok(alert !== null)
  assert.strictEqual(alert.raised_by_id, null)
  assert.strictEqual(alert.dispute_id, null)
})

// ---------- precedence --------------------------------------------------------

test('the CHAIN actor wins over the triage row when they disagree', { skip }, async () => {
  // Reachable: the creator POSTs /dispute (stamping raised_by), their broadcast
  // fails, and the worker raises it with a raw transaction. The row names the
  // creator; the chain names the worker. Naming the wrong party in a dispute
  // alert is worse than naming none.
  const { escrow, tx_ref } = await disputedGig({ actor_id: worker.row.id })
  await raiseTriageRow(escrow.id, creator.row.id)

  const alert = await resolveDisputeRaised(getApp().db, refFor(escrow.id, tx_ref))

  assert.ok(alert !== null)
  assert.strictEqual(alert.raised_by_id, worker.row.id, 'chain-attested actor must win')
  // The row's other facts are still used — only the raiser is contested.
  assert.strictEqual(alert.reason, 'Work not delivered')
})

test('falls back to the triage row when the transaction has no actor', { skip }, async () => {
  const { escrow, tx_ref } = await disputedGig({ actor_id: null })
  await raiseTriageRow(escrow.id, creator.row.id)

  const alert = await resolveDisputeRaised(getApp().db, refFor(escrow.id, tx_ref))

  assert.strictEqual(alert?.raised_by_id, creator.row.id)
})

// ---------- shapes that have no row --------------------------------------------

test('an exchange escrow resolves with a null title, not a missing alert', { skip }, async () => {
  // gig_details has no row for an exchange escrow. An INNER JOIN here would
  // silently drop every exchange dispute.
  const app = getApp()
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    kind: 'exchange',
    status: 'disputed',
  })
  const tx_ref = `sig-${randomUUID()}`
  await app.db.insert(escrow_transactions).values({
    escrow_id: escrow.id,
    type: 'dispute',
    tx_ref,
    actor_id: creator.row.id,
  })
  await raiseTriageRow(escrow.id, creator.row.id)

  const alert = await resolveDisputeRaised(app.db, refFor(escrow.id, tx_ref))

  assert.ok(alert !== null, 'an exchange dispute must still alert')
  assert.strictEqual(alert.escrow_kind, 'exchange')
  assert.strictEqual(alert.escrow_title, null)
})

test('an unassigned escrow resolves with a null counterparty', { skip }, async () => {
  const app = getApp()
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: null,
    status: 'disputed',
  })
  await attachGigDetails(app, escrow.id)
  const tx_ref = `sig-${randomUUID()}`
  await app.db.insert(escrow_transactions).values({
    escrow_id: escrow.id,
    type: 'dispute',
    tx_ref,
    actor_id: creator.row.id,
  })

  const alert = await resolveDisputeRaised(app.db, refFor(escrow.id, tx_ref))

  assert.strictEqual(alert?.counterparty_id, null)
  assert.strictEqual(alert?.creator_id, creator.row.id)
})

test('a missing transaction row still resolves — the escrow is the subject', { skip }, async () => {
  // The tx row is written in the same transaction as the status flip, so this
  // should not happen; the LEFT JOIN means it degrades rather than going quiet
  // if it ever does.
  const app = getApp()
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'disputed',
  })
  await attachGigDetails(app, escrow.id)
  await raiseTriageRow(escrow.id, worker.row.id)

  const alert = await resolveDisputeRaised(app.db, refFor(escrow.id, `sig-${randomUUID()}`))

  assert.ok(alert !== null)
  assert.strictEqual(alert.raised_by_id, worker.row.id, 'falls back to the triage row')
})

// ---------- the one real null ---------------------------------------------------

test('a vanished escrow resolves to null (drop the job, do not retry)', { skip }, async () => {
  const alert = await resolveDisputeRaised(
    getApp().db,
    refFor(randomUUID(), `sig-${randomUUID()}`),
  )
  assert.strictEqual(alert, null)
})

// ---------- the ref is the identity ---------------------------------------------

test('each tx_ref resolves to ITS OWN actor, not the escrow\'s first transaction', { skip }, async () => {
  // An escrow can carry several dispute transactions (a re-raise after a failed
  // broadcast). The join must select the one the ref names.
  //
  // Asserting BOTH directions is what makes this deterministic. Checking a
  // single ref would pass by luck whenever `limit(1)` happened to return the
  // right row — and it did: dropping the tx_ref predicate from the join
  // survived the one-sided version of this test. If the predicate is missing,
  // both refs collapse onto the same arbitrary row, so whichever one that is,
  // the other assertion fails.
  const { escrow, tx_ref: workerRef } = await disputedGig()
  await raiseTriageRow(escrow.id, worker.row.id)

  const creatorRef = `sig-${randomUUID()}`
  await getApp().db.insert(escrow_transactions).values({
    escrow_id: escrow.id,
    type: 'dispute',
    tx_ref: creatorRef,
    actor_id: creator.row.id,
  })

  const first = await resolveDisputeRaised(getApp().db, refFor(escrow.id, workerRef))
  const second = await resolveDisputeRaised(getApp().db, refFor(escrow.id, creatorRef))

  assert.strictEqual(first?.tx_ref, workerRef)
  assert.strictEqual(second?.tx_ref, creatorRef)
  assert.strictEqual(first?.raised_by_id, worker.row.id)
  assert.strictEqual(second?.raised_by_id, creator.row.id)
})

// ---------- resolveAlert: the dispatch ------------------------------------------
// The tests above call the dispute resolver DIRECTLY. These call it the way the
// consumer will — through the kind→resolver map — which is a separate failure
// mode: a map wired to the wrong function, or one that swallows the result,
// leaves every test above green while no alert ever resolves.

test('resolveAlert routes a dispute.raised ref to the dispute resolver', { skip }, async () => {
  const { escrow, tx_ref } = await disputedGig()
  await raiseTriageRow(escrow.id, worker.row.id)
  const ref = refFor(escrow.id, tx_ref)

  const viaMap = await resolveAlert(getApp().db, ref)
  const direct = await resolveDisputeRaised(getApp().db, ref)

  // Identical, field for field: the map must add nothing and drop nothing.
  assert.deepStrictEqual(viaMap, direct)
  assert.ok(viaMap !== null)
  assert.strictEqual(viaMap.escrow_id, escrow.id)
})

test('resolveAlert returns the kind it was ASKED for', { skip }, async () => {
  // Guards cross-wiring: a resolver registered under the wrong key would
  // answer a dispute ref with some other kind's shape. The compiler rejects
  // that today; this keeps it rejected if the map ever gains a cast.
  const { escrow, tx_ref } = await disputedGig()
  const alert = await resolveAlert(getApp().db, refFor(escrow.id, tx_ref))
  assert.strictEqual(alert?.kind, 'dispute.raised')
  assert.ok(ALERT_KINDS.includes(alert!.kind), 'resolved a kind outside the declared vocabulary')
})

test('resolveAlert passes a null result through, it does not invent one', { skip }, async () => {
  // The subject is gone. The consumer relies on null to DROP the job rather
  // than retry; a map that coerced null into an object would burn 5 attempts
  // delivering an empty alert.
  const alert = await resolveAlert(getApp().db, refFor(randomUUID(), `sig-${randomUUID()}`))
  assert.strictEqual(alert, null)
})
