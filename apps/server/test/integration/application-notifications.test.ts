/**
 * Approval mode's two notification paths.
 *
 * Both exist because the person who needs to know took no action and gets no
 * other signal:
 *
 *  - the POSTER, when a worker applies. An application writes a row and sends
 *    no transaction, so without this the shortlist is a screen nobody has a
 *    reason to open and the whole mode stalls.
 *  - the LOSING APPLICANTS, when someone else is assigned (D4). Their row
 *    simply stops being open; nothing else tells them the decision is made.
 *
 * The `passed` ids come from the applier rather than a re-read, and the test
 * that matters most here proves why: after the commit, rows this transition
 * settled are indistinguishable from ones an earlier assign/unassign cycle
 * settled. Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { gig_applications } from '@tenda/shared/db/schema'
import { appEvents, type AppEvents } from '@server/lib/events'
import { drizzleEscrowEventStore } from '@server/lib/escrow-events'
import { fanOutEscrowEvent, type EscrowFanoutEvent } from '@server/workers/escrow-fanout'
import { installCapture, type SideEffectCapture } from '../helpers/side-effects'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
  authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

type App = ReturnType<typeof getApp>

let capture: SideEffectCapture

/**
 * The apply route's contract is the EVENT, not the push.
 *
 * The harness deliberately does not autoload plugins, so no listener is
 * attached here — and that is the right seam anyway: this file owns "does the
 * route emit, with what, and exactly when", while the listener's copy and
 * deep-link are pinned in unit/notifications-plugin.test.ts. Asserting the
 * push here would test the same wiring twice and neither thing properly.
 */
let received: AppEvents['gig.application_received'][]

function captureApplicationEvents(): () => void {
  received = []
  const listener = (data: AppEvents['gig.application_received']) => {
    received.push(data)
  }
  appEvents.on('gig.application_received', listener)
  return () => {
    appEvents.off('gig.application_received', listener)
  }
}

let stopCapture: (() => void) | null = null

beforeEach(() => {
  if (skip) return
  capture = installCapture(getApp())
  stopCapture?.()
  stopCapture = captureApplicationEvents()
})

after(() => {
  stopCapture?.()
})

async function approvalGig(app: App, creator_id: string, title = 'Paint the fence') {
  const escrow = await createEscrow(app, {
    creator_id,
    status: 'open',
    requires_approval: true,
    escrow_ref: `ref-${Math.random().toString(36).slice(2)}`,
  })
  await attachGigDetails(app, escrow.id, { title })
  return escrow
}

const applyTo = (app: App, token: string, id: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/v1/gigs/${id}/applications`,
    headers: authHeader(token),
    payload: body,
  })

// ── the poster learns an application arrived ───────────────────────────────

test('applying announces it to the poster, carrying the gig title', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await approvalGig(app, poster.row.id, 'Deliver a parcel')

  assert.strictEqual((await applyTo(app, worker.token, escrow.id)).statusCode, 201)

  assert.strictEqual(received.length, 1)
  assert.deepStrictEqual(received[0], {
    escrow_id: escrow.id,
    creator_id: poster.row.id,
    applicant_id: worker.row.id,
    // The title rides along because a poster can have several gigs taking
    // applications at once; "someone applied" alone would not say which.
    title: 'Deliver a parcel',
  })
})

test('editing an existing open application does NOT re-notify', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await approvalGig(app, poster.row.id)

  await applyTo(app, worker.token, escrow.id, { message: 'first pitch' })
  assert.strictEqual(received.length, 1)

  // Re-applying upserts the SAME row. A second buzz would train the poster to
  // ignore the notice that matters.
  await applyTo(app, worker.token, escrow.id, { message: 'better pitch' })
  assert.strictEqual(received.length, 1)
})

test('re-applying after withdrawing IS a new hand raised, so it notifies again', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await approvalGig(app, poster.row.id)

  await applyTo(app, worker.token, escrow.id)
  await app.inject({
    method: 'DELETE',
    url: `/v1/gigs/${escrow.id}/applications`,
    headers: authHeader(worker.token),
  })
  await applyTo(app, worker.token, escrow.id)

  assert.strictEqual(received.length, 2)
  assert.ok(received.every((e) => e.creator_id === poster.row.id))
})

test('a rejected application notifies nobody', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const escrow = await approvalGig(app, poster.row.id)

  // The poster applying to their own gig is a 403, and a refused write must
  // not fire the listener.
  assert.strictEqual((await applyTo(app, poster.token, escrow.id)).statusCode, 403)
  assert.deepStrictEqual(received, [])
})

// ── the losing applicants learn the decision (D4) ──────────────────────────

test('assigning settles the rivals and the fan-out tells exactly them', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const winner = await createUser(app)
  const loserA = await createUser(app)
  const loserB = await createUser(app)
  const escrow = await approvalGig(app, poster.row.id)

  for (const u of [winner, loserA, loserB]) await applyTo(app, u.token, escrow.id)

  const outcome = await drizzleEscrowEventStore(app.db).applyEvent({
    escrow_id: escrow.id,
    from: ['open'],
    patch: { status: 'accepted', counterparty_id: winner.row.id },
    transaction: {
      type: 'assign_accept',
      tx_ref: `sig-${Math.random().toString(36).slice(2)}`,
      amount_raw: null,
      platform_fee_raw: null,
      creator_payout_raw: null,
      actor_id: poster.row.id,
    },
    application: { applicant_id: winner.row.id },
  })

  assert.strictEqual(outcome.applied, true)
  assert.deepStrictEqual(
    [...outcome.passed_applicant_ids].sort(),
    [loserA.row.id, loserB.row.id].sort(),
  )

  capture = installCapture(app)
  await fanOutEscrowEvent(app, {
    internal_event: 'escrow.counterparty_assigned',
    escrow_id: escrow.id,
    wire_event: 'CounterpartyAssigned',
    tx_ref: 'sig-fanout',
    counterparty_id: winner.row.id,
    passed_applicant_ids: outcome.passed_applicant_ids,
    revived_applicant_ids: outcome.revived_applicant_ids,
  } satisfies EscrowFanoutEvent)

  const recipients = capture.notifiedUserIds()
  // The winner gets the "You got the gig" notice; the two losers get theirs.
  assert.strictEqual(recipients.length, 3)
  assert.ok(recipients.includes(loserA.row.id))
  assert.ok(recipients.includes(loserB.row.id))
  assert.ok(recipients.includes(winner.row.id))
  const loserNotice = capture.notifications().find((n) => n.user_id === loserA.row.id)
  assert.strictEqual(loserNotice?.title, 'Gig assigned to someone else')
})

/**
 * The mirror image: an unassign puts the rivals back in the running, and that
 * is the ONLY signal they get — their row simply changes status again. Without
 * it they would have been told "the gig went to someone else" and never told
 * that it hadn't.
 */
test('unassigning revives the rivals and the fan-out tells exactly them', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const winner = await createUser(app)
  const rival = await createUser(app)
  const escrow = await approvalGig(app, poster.row.id)

  for (const u of [winner, rival]) await applyTo(app, u.token, escrow.id)

  const store = drizzleEscrowEventStore(app.db)
  await store.applyEvent({
    escrow_id: escrow.id,
    from: ['open'],
    patch: { status: 'accepted', counterparty_id: winner.row.id },
    transaction: {
      type: 'assign_accept',
      tx_ref: `sig-${Math.random().toString(36).slice(2)}`,
      amount_raw: null,
      platform_fee_raw: null,
      creator_payout_raw: null,
      actor_id: poster.row.id,
    },
    application: { applicant_id: winner.row.id },
  })

  const outcome = await store.applyEvent({
    escrow_id: escrow.id,
    from: ['accepted'],
    patch: { status: 'open', counterparty_id: null, assignment_released_at: null },
    transaction: {
      type: 'unassign',
      tx_ref: `sig-${Math.random().toString(36).slice(2)}`,
      amount_raw: null,
      platform_fee_raw: null,
      creator_payout_raw: null,
      actor_id: poster.row.id,
    },
    revertApplications: { now: new Date() },
  })

  assert.deepStrictEqual(outcome.revived_applicant_ids, [rival.row.id])
  // The released worker is NOT revived: the poster let them go on purpose.
  assert.deepStrictEqual(outcome.passed_applicant_ids, [])

  capture = installCapture(app)
  await fanOutEscrowEvent(app, {
    internal_event: 'escrow.assignment_released',
    escrow_id: escrow.id,
    wire_event: 'AssignmentReleased',
    tx_ref: 'sig-fanout-revive',
    counterparty_id: winner.row.id,
    passed_applicant_ids: outcome.passed_applicant_ids,
    revived_applicant_ids: outcome.revived_applicant_ids,
  } satisfies EscrowFanoutEvent)

  const revivedNotice = capture.notifications().find((n) => n.user_id === rival.row.id)
  assert.strictEqual(revivedNotice?.title, "You're back in the running")
  // The released worker still gets their own "Assignment withdrawn" notice,
  // and nobody is told both things about one transition.
  const workerNotices = capture.notifications().filter((n) => n.user_id === winner.row.id)
  assert.strictEqual(workerNotices.length, 1)
  assert.strictEqual(workerNotices[0]?.title, 'Assignment withdrawn')
})

test('a SECOND assign cycle notifies only the newly passed, not the old ones', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const first = await createUser(app)
  const oldLoser = await createUser(app)
  const escrow = await approvalGig(app, poster.row.id)

  await applyTo(app, first.token, escrow.id)
  await applyTo(app, oldLoser.token, escrow.id)

  const store = drizzleEscrowEventStore(app.db)
  const tx = (type: 'assign_accept') => ({
    type,
    tx_ref: `sig-${Math.random().toString(36).slice(2)}`,
    amount_raw: null,
    platform_fee_raw: null,
    creator_payout_raw: null,
    actor_id: poster.row.id,
  })

  await store.applyEvent({
    escrow_id: escrow.id,
    from: ['open'],
    patch: { status: 'accepted', counterparty_id: first.row.id },
    transaction: tx('assign_accept'),
    application: { applicant_id: first.row.id },
  })

  // Round one settled `oldLoser` as passed and `first` as assigned.
  const afterRoundOne = await app.db
    .select({ applicant_id: gig_applications.applicant_id, status: gig_applications.status })
    .from(gig_applications)
    .where(eq(gig_applications.escrow_id, escrow.id))
  assert.strictEqual(
    afterRoundOne.find((r) => r.applicant_id === oldLoser.row.id)?.status,
    'passed',
  )

  // The poster releases the assignment; the escrow returns to `open`.
  await store.applyEvent({
    escrow_id: escrow.id,
    from: ['accepted'],
    patch: { status: 'open', counterparty_id: null },
    transaction: tx('assign_accept'),
  })

  const newLoser = await createUser(app)
  const second = await createUser(app)
  await applyTo(app, newLoser.token, escrow.id)
  await applyTo(app, second.token, escrow.id)

  const outcome = await store.applyEvent({
    escrow_id: escrow.id,
    from: ['open'],
    patch: { status: 'accepted', counterparty_id: second.row.id },
    transaction: tx('assign_accept'),
    application: { applicant_id: second.row.id },
  })

  // Exactly the applicant this commit settled. `oldLoser` was passed in round
  // one and must not be told twice — which is precisely what re-reading the
  // table for status='passed' would have done.
  assert.deepStrictEqual(outcome.passed_applicant_ids, [newLoser.row.id])
})

test('a tripped status guard settles nothing and notifies nobody', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const rival = await createUser(app)
  const escrow = await approvalGig(app, poster.row.id)

  await applyTo(app, worker.token, escrow.id)
  await applyTo(app, rival.token, escrow.id)

  const outcome = await drizzleEscrowEventStore(app.db).applyEvent({
    // Wrong `from`: the escrow is `open`, so the guard trips.
    escrow_id: escrow.id,
    from: ['submitted'],
    patch: { status: 'accepted', counterparty_id: worker.row.id },
    transaction: {
      type: 'assign_accept',
      tx_ref: 'sig-guard-trip',
      amount_raw: null,
      platform_fee_raw: null,
      creator_payout_raw: null,
      actor_id: poster.row.id,
    },
    application: { applicant_id: worker.row.id },
  })

  assert.strictEqual(outcome.applied, false)
  assert.deepStrictEqual(outcome.passed_applicant_ids, [])
  const rows = await app.db
    .select({ status: gig_applications.status })
    .from(gig_applications)
    .where(eq(gig_applications.escrow_id, escrow.id))
  assert.ok(rows.every((r) => r.status === 'open'))
})
