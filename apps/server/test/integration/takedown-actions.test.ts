/**
 * What a taken-down escrow still LETS YOU DO (#CO1 enforcement).
 *
 * admin-takedown.test.ts covers visibility — who can still read a hidden
 * listing. This file covers the other half, which had no enforcement at all:
 * `hidden` was a read filter, so a stale client could accept, apply to, or fund
 * a listing moderation had pulled, and the server would happily build the
 * transaction.
 *
 * The shape of every test here is the same pair, and the pair is the point:
 *   - a WAY IN is refused with ESCROW_TAKEN_DOWN;
 *   - the corresponding WAY OUT still works.
 * Blocking an exit would be the worse bug of the two. A hidden escrow can be
 * holding funds locked on-chain, and the parties did nothing wrong.
 *
 * The exits assert a full 200, not merely a different error code — see
 * `assertExitAllowed` for why the weaker form was worse than useless here.
 * That means the fixtures have to carry the deadlines each guard reads
 * (completion_deadline for submit/reclaim, approval_deadline for claim) and the
 * bodies each route validates before it consults the gate.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachExchangeDetails,
  authHeader,
} from '../helpers/test-app'
import { hideEscrow, openGig, unhideEscrow } from '../helpers/escrow-states'
import { gig_applications } from '@tenda/shared/db/schema'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** `code` off an error envelope, or null when the call did not fail. */
function errorCode(res: { statusCode: number; json: () => unknown }): string | null {
  if (res.statusCode < 400) return null
  const body: unknown = res.json()
  if (typeof body !== 'object' || body === null || !('code' in body)) return null
  const { code } = body
  return typeof code === 'string' ? code : null
}

function assertTakenDown(res: { statusCode: number; json: () => unknown }, what: string): void {
  assert.strictEqual(res.statusCode, 409, `${what}: expected 409, got ${res.statusCode}`)
  assert.strictEqual(errorCode(res), ErrorCode.ESCROW_TAKEN_DOWN, `${what}: error code`)
}

/**
 * An exit MUST still succeed outright — 200 with an unsigned transaction.
 *
 * Asserting the full success rather than "not the takedown code" is deliberate,
 * and it is the second version of this helper. The first only checked that the
 * error code was not ESCROW_TAKEN_DOWN, which passed VACUOUSLY for four of the
 * calls below: `submit` and `dispute` validate their body before reaching
 * `guardTransition`, so an empty payload 400s without ever consulting the gate,
 * and `claim`/`refund` 500'd on fixtures with no deadlines. All four would have
 * gone on passing if the gate had blocked every exit. A negative assertion
 * cannot tell "the gate allowed it" from "the request never got there".
 */
function assertExitAllowed(res: { statusCode: number; json: () => unknown }, what: string): void {
  assert.strictEqual(
    res.statusCode,
    200,
    `${what}: expected the exit to succeed, got ${res.statusCode} ${JSON.stringify(res.json())}`,
  )
}

/** A future/past instant, for fixtures whose deadlines the guards read. */
const HOUR_MS = 3_600_000
const inFuture = (hours: number) => new Date(Date.now() + hours * HOUR_MS)
const inPast = (hours: number) => new Date(Date.now() - hours * HOUR_MS)

// ── instant-mode gig: accept in, cancel out ─────────────────────────────────

test('takedown: a stranger cannot accept a hidden gig, and unhiding restores it', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app)
  const worker = await createUser(app)

  await hideEscrow(app, escrow.id)
  const refused = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/accept`,
    headers: authHeader(worker.token),
  })
  assertTakenDown(refused, 'accept on a hidden gig')

  // The gate is the ONLY thing that changed: restore visibility and the same
  // call stops being refused for this reason.
  await unhideEscrow(app, escrow.id)
  const restored = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/accept`,
    headers: authHeader(worker.token),
  })
  // Not asserted as a 200: accepting needs a wallet on the chain and a
  // verified contact (`assertCanTransact`), which this worker has not got. The
  // point is only that the TAKEDOWN is no longer what stops them.
  assert.notStrictEqual(
    errorCode(restored),
    ErrorCode.ESCROW_TAKEN_DOWN,
    'accept after unhiding must not still be refused as taken down',
  )
})

test('takedown: the poster can still cancel a hidden gig', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await openGig(app)
  await hideEscrow(app, escrow.id)

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/cancel`,
    headers: authHeader(creator.token),
  })
  assertExitAllowed(res, 'poster cancelling a hidden gig')
})

// ── mid-flight escrows: every exit survives ─────────────────────────────────

test('takedown: an accepted hidden gig still submits and disputes', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  // Deadline in the FUTURE: `submit` is bounded by completion_deadline + grace,
  // and the bare fixture leaves it null, which the guard answers with a 500
  // before it ever reaches the takedown check.
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
    completion_deadline: inFuture(24),
    completion_duration_seconds: 86_400,
  })
  await hideEscrow(app, escrow.id)

  // The worker's money is on the line here; a takedown must not touch any of it.
  const submit = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/submit`,
    headers: authHeader(worker.token),
    payload: { proof_hash: 'a'.repeat(64) },
  })
  assertExitAllowed(submit, 'worker submitting')

  const dispute = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/dispute`,
    headers: authHeader(creator.token),
    payload: { reason: 'Work was never delivered as agreed', bond_raw: '1000' },
  })
  assertExitAllowed(dispute, 'poster disputing')
})

/**
 * `refund` does not go through `guardTransition` — it picks between
 * `refund_expired` and `reclaim_abandoned` itself — so no takedown gate runs on
 * it today, and mutating the gate cannot make this test fail. It is here as a
 * guard against the OTHER direction: someone adding `assertNotTakenDown` to
 * this route, which would strand a poster's funds on an abandoned hidden gig.
 * Same reasoning for the DELETE half of the draft test below.
 */
test('takedown: a hidden gig the worker abandoned can still be reclaimed', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  // Past the delivery window AND its grace, which is what `reclaim_abandoned`
  // requires — this is the poster's only route back to their locked funds.
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
    completion_deadline: inPast(72),
    completion_duration_seconds: 86_400,
  })
  await hideEscrow(app, escrow.id)

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/refund`,
    headers: authHeader(creator.token),
  })
  assertExitAllowed(res, 'poster reclaiming an abandoned hidden gig')
})

test('takedown: a submitted hidden gig still approves and claims', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  // approval_deadline in the past: `claim_stalled` is the worker's answer to a
  // poster who never approved, and the guard refuses it before that moment.
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'submitted',
    approval_deadline: inPast(1),
  })
  await hideEscrow(app, escrow.id)

  const claim = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/claim`,
    headers: authHeader(worker.token),
  })
  assertExitAllowed(claim, 'worker claiming a stalled payout')

  const approve = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/approve`,
    headers: authHeader(creator.token),
  })
  assertExitAllowed(approve, 'poster approving')
})

// ── approval mode: apply and assign in, withdraw out ────────────────────────

test('takedown: a hidden gig takes no applications', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app, { escrow: { requires_approval: true } })
  const worker = await createUser(app)
  await hideEscrow(app, escrow.id)

  const res = await app.inject({
    method: 'POST',
    url: `/v1/gigs/${escrow.id}/applications`,
    headers: authHeader(worker.token),
    payload: { message: 'I can do this' },
  })
  assertTakenDown(res, 'apply to a hidden gig')
})

test('takedown: the poster cannot assign from a hidden gig', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await openGig(app, { escrow: { requires_approval: true } })
  const worker = await createUser(app)
  await app.db.insert(gig_applications).values({
    escrow_id: escrow.id,
    applicant_id: worker.row.id,
    expires_at: new Date(Date.now() + 86_400_000),
  })
  await hideEscrow(app, escrow.id)

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/assign`,
    headers: authHeader(creator.token),
    payload: { worker_user_id: worker.row.id },
  })
  assertTakenDown(res, 'assign on a hidden gig')
})

test('takedown: an applicant can still WITHDRAW from a hidden gig', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app, { escrow: { requires_approval: true } })
  const worker = await createUser(app)
  await app.db.insert(gig_applications).values({
    escrow_id: escrow.id,
    applicant_id: worker.row.id,
    expires_at: new Date(Date.now() + 86_400_000),
  })
  await hideEscrow(app, escrow.id)

  // The exit that would dead-end if it were gated: the gig detail 404s for an
  // applicant (they are not a party), so this route and /v1/applications are
  // the only way out of an application on a gig that was pulled.
  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/gigs/${escrow.id}/applications`,
    headers: authHeader(worker.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), { withdrawn: true })
})

test('takedown: /v1/applications keeps listing a hidden gig', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app, { escrow: { requires_approval: true } })
  const worker = await createUser(app)
  await app.db.insert(gig_applications).values({
    escrow_id: escrow.id,
    applicant_id: worker.row.id,
    expires_at: new Date(Date.now() + 86_400_000),
  })
  await hideEscrow(app, escrow.id)

  // Deliberately NOT filtered: an applicant who cannot see the row cannot
  // withdraw from it, and their application would sit open until it expired.
  const res = await app.inject({
    method: 'GET',
    url: '/v1/applications',
    headers: authHeader(worker.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().total, 1)
})

// ── drafts: publishing is funding ───────────────────────────────────────────

test('takedown: a hidden draft cannot be published but can be deleted', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await openGig(app, { escrow: { status: 'draft' } })
  await hideEscrow(app, escrow.id)

  const publish = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/build-create`,
    headers: authHeader(creator.token),
  })
  assertTakenDown(publish, 'publishing a hidden draft')

  // Discarding it is a way out, and the creator's own row — never gated.
  const remove = await app.inject({
    method: 'DELETE',
    url: `/v1/escrows/${escrow.id}`,
    headers: authHeader(creator.token),
  })
  assertExitAllowed(remove, 'deleting a hidden draft')
})

// ── exchange: the same gate, through the same routes ────────────────────────

test('takedown: a hidden exchange offer refuses accept, keeps cancel', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const buyer = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
  })
  await attachExchangeDetails(app, escrow.id)
  await hideEscrow(app, escrow.id)

  const accept = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/accept`,
    headers: authHeader(buyer.token),
  })
  assertTakenDown(accept, 'accept on a hidden offer')

  const cancel = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/cancel`,
    headers: authHeader(seller.token),
  })
  assertExitAllowed(cancel, 'seller cancelling a hidden offer')
})

// ── the wire carries the flag ───────────────────────────────────────────────

test('takedown: the detail tells the parties, and reads false otherwise', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await openGig(app)

  const before = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${escrow.id}`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(before.json().hidden, false)

  await hideEscrow(app, escrow.id)
  const after = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${escrow.id}`,
    headers: authHeader(creator.token),
  })
  // The poster is the one person who would otherwise never learn their listing
  // is off the board — they would just wonder why nobody applies.
  assert.strictEqual(after.json().hidden, true)
})
