/**
 * The approval-mode transition routes: assign, unassign, release.
 *
 * `assign` is the interesting one — it is the only transition where the party
 * taking on the work is NOT the caller, so everything normally checked at the
 * worker's own accept has to be checked here on their behalf. The negatives
 * below are that list.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows, gig_applications } from '@tenda/shared/db/schema'
import { APPLICATION_ASSIGN_HOLD_SECONDS, ErrorCode } from '@tenda/shared'
import { getPlatformConfig } from '@server/lib/platform'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
  makeTransactable,
  authHeader,
  setPlatformConfig,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
type App = ReturnType<typeof getApp>

async function scenario(app: App, escrowOverrides = {}) {
  const poster = await createUser(app)
  const worker = await createUser(app)
  await makeTransactable(app, poster.row.id)
  await makeTransactable(app, worker.row.id)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: true,
    unassign_window_seconds: 6 * 3600,
    escrow_ref: `ref-${Math.random().toString(36).slice(2)}`,
    ...escrowOverrides,
  })
  await attachGigDetails(app, escrow.id, {})
  return { poster, worker, escrow }
}

async function applyFor(app: App, escrow_id: string, applicant_id: string, expires_at?: Date) {
  const [row] = await app.db
    .insert(gig_applications)
    .values({
      escrow_id,
      applicant_id,
      status: 'open',
      expires_at: expires_at ?? new Date(Date.now() + 86_400_000),
    })
    .returning()
  return row
}

const assign = (app: App, token: string, id: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/v1/escrows/${id}/assign`,
    headers: authHeader(token),
    payload: body,
  })

// ---------- assign: happy path ---------------------------------------------

test('assign: builds a transaction and HOLDS the application', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app)
  // A window short enough that the hold visibly extends it.
  const soon = new Date(Date.now() + 60_000)
  const row = await applyFor(app, escrow.id, worker.row.id, soon)

  const res = await assign(app, poster.token, escrow.id, { worker_user_id: worker.row.id })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned, 'returns an unsigned tx for the poster to sign')

  const [held] = await app.db
    .select({ expires_at: gig_applications.expires_at, status: gig_applications.status })
    .from(gig_applications)
    .where(eq(gig_applications.id, row.id))
  assert.ok(
    held.expires_at.getTime() > soon.getTime(),
    'the row must not lapse while the poster signs',
  )
  assert.ok(
    held.expires_at.getTime() <= Date.now() + APPLICATION_ASSIGN_HOLD_SECONDS * 1000 + 5_000,
    'the hold is a short window, not an open-ended extension',
  )
  // Still OPEN: the applier settles it when the transaction confirms, so an
  // abandoned signature must not have burned it.
  assert.strictEqual(held.status, 'open')
  const [e] = await app.db
    .select({ status: escrows.status })
    .from(escrows)
    .where(eq(escrows.id, escrow.id))
  assert.strictEqual(e.status, 'open', 'the escrow does not move until the tx confirms')
})

// The hold must never bring an expiry FORWARD.
test('assign: a long-dated application is not shortened by the hold', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app)
  const far = new Date(Date.now() + 86_400_000)
  const row = await applyFor(app, escrow.id, worker.row.id, far)

  await assign(app, poster.token, escrow.id, { worker_user_id: worker.row.id })

  const [held] = await app.db
    .select({ expires_at: gig_applications.expires_at })
    .from(gig_applications)
    .where(eq(gig_applications.id, row.id))
  assert.strictEqual(held.expires_at.getTime(), far.getTime())
})

// ---------- assign: negatives ----------------------------------------------

test('assign: only the creator — and the error does not vary with the body', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await scenario(app)
  const other = await createUser(app)
  await applyFor(app, escrow.id, worker.row.id)

  // Authorization is settled before the body is interpreted, so a non-creator
  // gets 403 whether they name someone else or themselves.
  for (const target of [other.row.id, worker.row.id]) {
    const res = await assign(app, worker.token, escrow.id, { worker_user_id: target })
    assert.strictEqual(res.statusCode, 403, `target=${target}`)
  }
})

test('assign: refused on an instant-mode gig', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app, { requires_approval: false })
  await applyFor(app, escrow.id, worker.row.id)
  const res = await assign(app, poster.token, escrow.id, { worker_user_id: worker.row.id })
  assert.strictEqual(res.statusCode, 409)
})

test('assign: a worker with no application cannot be assigned through this route', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app)
  const res = await assign(app, poster.token, escrow.id, { worker_user_id: worker.row.id })
  assert.strictEqual(res.statusCode, 404)
})

test('assign: an EXPIRED application is refused', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app)
  await applyFor(app, escrow.id, worker.row.id, new Date(Date.now() - 1_000))
  const res = await assign(app, poster.token, escrow.id, { worker_user_id: worker.row.id })
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'APPLICATION_NOT_OPEN')
})

test('assign: a WITHDRAWN application is refused', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app)
  const row = await applyFor(app, escrow.id, worker.row.id)
  await app.db
    .update(gig_applications)
    .set({ status: 'withdrawn' })
    .where(eq(gig_applications.id, row.id))
  const res = await assign(app, poster.token, escrow.id, { worker_user_id: worker.row.id })
  assert.strictEqual(res.statusCode, 409)
})

test('assign: the poster cannot assign themselves', { skip }, async () => {
  const app = getApp()
  const { poster, escrow } = await scenario(app)
  const res = await assign(app, poster.token, escrow.id, { worker_user_id: poster.row.id })
  assert.strictEqual(res.statusCode, 422)
})

test('assign: a missing worker_user_id is a 422, not a crash', { skip }, async () => {
  const app = getApp()
  const { poster, escrow } = await scenario(app)
  assert.strictEqual((await assign(app, poster.token, escrow.id, {})).statusCode, 422)
})

// The worker is not the caller, so THEIR capacity has to be enforced here or
// approval mode becomes a way around the cap entirely.
test('assign: refused when the WORKER is at capacity, with poster-facing copy', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app)
  await setPlatformConfig(app, { max_pending_gigs: 1 })

  // One live gig already on the worker.
  await createEscrow(app, {
    creator_id: poster.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
    completion_deadline: new Date(Date.now() + 86_400_000),
    escrow_ref: 'ref-busy',
  })
  await applyFor(app, escrow.id, worker.row.id)

  const res = await assign(app, poster.token, escrow.id, { worker_user_id: worker.row.id })
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'GIG_CAPACITY_REACHED')
  // Third-person: telling the POSTER "you can work on 1 gig" would be wrong.
  assert.match(res.json().message, /this worker/i)
})

// ---------- release ---------------------------------------------------------

const release = (app: App, token: string, id: string) =>
  app.inject({ method: 'POST', url: `/v1/escrows/${id}/release`, headers: authHeader(token) })

test('release: the assigned worker stamps it, and it is idempotent', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await scenario(app)
  await app.db
    .update(escrows)
    .set({ status: 'accepted', counterparty_id: worker.row.id })
    .where(eq(escrows.id, escrow.id))

  const first = await release(app, worker.token, escrow.id)
  assert.strictEqual(first.statusCode, 200)
  const stamp = first.json().released_at
  assert.ok(stamp)

  const again = await release(app, worker.token, escrow.id)
  assert.strictEqual(again.statusCode, 200)
  assert.strictEqual(again.json().released_at, stamp, 'a double tap must not move the stamp')
})

test('release: only the assigned worker, and only from accepted', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app)

  // Still open — nobody is assigned yet.
  assert.strictEqual((await release(app, worker.token, escrow.id)).statusCode, 403)

  await app.db
    .update(escrows)
    .set({ status: 'accepted', counterparty_id: worker.row.id })
    .where(eq(escrows.id, escrow.id))
  // The poster is not the worker.
  assert.strictEqual((await release(app, poster.token, escrow.id)).statusCode, 403)

  // Past `accepted` there is nothing to step back FROM — the work is in the
  // poster's hands (or a mediator's), and the exit is dispute, not release.
  for (const status of ['submitted', 'disputed', 'completed'] as const) {
    await app.db.update(escrows).set({ status }).where(eq(escrows.id, escrow.id))
    const res = await release(app, worker.token, escrow.id)
    assert.strictEqual(res.statusCode, 409, `release from ${status}`)
    assert.strictEqual(res.json().code, ErrorCode.ESCROW_WRONG_STATUS)
  }
})

/**
 * The bound the release prompt has always PROMISED ("do it before the delivery
 * window runs out") and nothing enforced.
 *
 * Releasing suppresses the abandonment strike, so an unbounded one makes
 * ghosting strictly better than the honest early exit: run the window out,
 * then step back for free just before the poster reclaims. Checked on the
 * route and not only in the client, because the strike is exactly what a
 * direct call would be evading.
 */
test('release: refused once the delivery window has passed', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await scenario(app)
  const { grace_period_seconds } = await getPlatformConfig(app.db)
  await app.db
    .update(escrows)
    .set({
      status: 'accepted',
      counterparty_id: worker.row.id,
      completion_deadline: new Date(Date.now() - (grace_period_seconds + 60) * 1_000),
    })
    .where(eq(escrows.id, escrow.id))

  const res = await release(app, worker.token, escrow.id)
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, ErrorCode.ESCROW_DEADLINE_PASSED)
})

test('release: still allowed inside the grace period, like submit', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await scenario(app)
  const { grace_period_seconds } = await getPlatformConfig(app.db)
  // Without room inside the grace the offset below lands in the FUTURE and the
  // test passes for the wrong reason — it would stop testing the grace at all.
  assert.ok(grace_period_seconds > 60, 'grace period too short to test inside it')
  await app.db
    .update(escrows)
    .set({
      status: 'accepted',
      counterparty_id: worker.row.id,
      // Deadline passed, but not by the whole grace — the same instant the
      // worker could still submit, so the same instant they can still decline.
      completion_deadline: new Date(Date.now() - (grace_period_seconds - 60) * 1_000),
    })
    .where(eq(escrows.id, escrow.id))

  assert.strictEqual((await release(app, worker.token, escrow.id)).statusCode, 200)
})

// A worker who accepted for themselves committed on-chain; stepping back from
// that is a dispute, not a one-tap release.
test('release: refused on an instant-mode gig the worker accepted', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await scenario(app, { requires_approval: false })
  await app.db
    .update(escrows)
    .set({ status: 'accepted', counterparty_id: worker.row.id })
    .where(eq(escrows.id, escrow.id))

  const res = await release(app, worker.token, escrow.id)
  assert.strictEqual(res.statusCode, 409)
})

// Releasing frees the slot immediately — the poster's unassign may be hours
// away, and holding the worker hostage until then punishes the honest signal.
test('release: frees the worker capacity slot straight away', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app)
  await setPlatformConfig(app, { max_pending_gigs: 1 })
  await app.db
    .update(escrows)
    .set({ status: 'accepted', counterparty_id: worker.row.id })
    .where(eq(escrows.id, escrow.id))

  await release(app, worker.token, escrow.id)

  // A second gig can now be assigned to them.
  const other = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: true,
    escrow_ref: 'ref-second',
  })
  await attachGigDetails(app, other.id, {})
  await applyFor(app, other.id, worker.row.id)

  const res = await assign(app, poster.token, other.id, { worker_user_id: worker.row.id })
  assert.strictEqual(res.statusCode, 200, 'the released gig no longer occupies their slot')
})

// ---------- unassign --------------------------------------------------------

const unassign = (app: App, token: string, id: string) =>
  app.inject({ method: 'POST', url: `/v1/escrows/${id}/unassign`, headers: authHeader(token) })

test('unassign: the creator can withdraw inside the window', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app)
  await app.db
    .update(escrows)
    .set({
      status: 'accepted',
      counterparty_id: worker.row.id,
      // accepted_at is DERIVED as completion_deadline − duration, so an
      // accept "just now" means deadline = now + duration.
      completion_deadline: new Date(Date.now() + 7_200_000),
      completion_duration_seconds: 7_200,
    })
    .where(eq(escrows.id, escrow.id))

  const res = await unassign(app, poster.token, escrow.id)
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned)
})

test('unassign: refused once the window has closed', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app, { unassign_window_seconds: 60 })
  await app.db
    .update(escrows)
    .set({
      status: 'accepted',
      counterparty_id: worker.row.id,
      // Accepted two hours ago, window was 60s.
      completion_deadline: new Date(Date.now() + 7_200_000 - 7_200_000),
      completion_duration_seconds: 7_200,
    })
    .where(eq(escrows.id, escrow.id))

  const res = await unassign(app, poster.token, escrow.id)
  assert.strictEqual(res.statusCode, 409)
})

test('unassign: only the creator, and never on an instant-mode gig', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await scenario(app, { requires_approval: false })
  await app.db
    .update(escrows)
    .set({
      status: 'accepted',
      counterparty_id: worker.row.id,
      completion_deadline: new Date(Date.now() + 7_200_000),
      completion_duration_seconds: 7_200,
    })
    .where(eq(escrows.id, escrow.id))

  // The worker accepted for themselves — the poster may not undo that.
  assert.strictEqual((await unassign(app, poster.token, escrow.id)).statusCode, 409)
  assert.strictEqual((await unassign(app, worker.token, escrow.id)).statusCode, 409)
})

// ---------- who may say "I'm not available", per acceptance mode -------------
//
// The governing rule is D2's: stepping back is CHEAP only for someone who never
// signed. Approval mode is the only path where a worker becomes the
// counterparty without a signature, so it is the only one `/release` serves.
// Everyone else already has a route out, and this table says which.

test('release: the whole mode matrix, so the answer is written down', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const rel = (id: string) =>
    app.inject({
      method: 'POST',
      url: `/v1/escrows/${id}/release`,
      headers: authHeader(worker.token),
    })

  // 1. INSTANT, accepted — they signed acceptEscrow, so their way out is a
  //    dispute or letting the deadline lapse into reclaim_abandoned.
  const instant = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'accepted',
    counterparty_id: worker.row.id,
    requires_approval: false,
    escrow_ref: 'matrix-instant',
  })
  const r1 = await rel(instant.id)
  assert.strictEqual(r1.statusCode, 409)
  assert.match(r1.json().message, /accepted this gig yourself/i)

  // 2. DIRECT INVITE, not yet accepted — they are on assigned_counterparty_id
  //    but counterparty_id is still null. Their way out is the on-chain
  //    decline, and the error has to SAY so rather than claim they are not the
  //    assigned worker (which they are).
  const invited = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    assigned_counterparty_id: worker.row.id,
    requires_approval: false,
    escrow_ref: 'matrix-invite-open',
  })
  const r2 = await rel(invited.id)
  assert.strictEqual(r2.statusCode, 409)
  assert.match(r2.json().message, /not accepted this gig yet/i)
  assert.match(r2.json().message, /decline/i)

  // 3. DIRECT INVITE, accepted — they signed, so it collapses to case 1.
  const invitedAccepted = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'accepted',
    counterparty_id: worker.row.id,
    assigned_counterparty_id: worker.row.id,
    requires_approval: false,
    escrow_ref: 'matrix-invite-accepted',
  })
  const r3 = await rel(invitedAccepted.id)
  assert.strictEqual(r3.statusCode, 409)
  assert.match(r3.json().message, /accepted this gig yourself/i)

  // 4. APPROVAL MODE — the only signature-free assignment, so the only one
  //    that gets a free way out.
  const approval = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'accepted',
    counterparty_id: worker.row.id,
    requires_approval: true,
    escrow_ref: 'matrix-approval',
  })
  const r4 = await rel(approval.id)
  assert.strictEqual(r4.statusCode, 200)
  assert.ok(r4.json().released_at)

  // 5. A stranger gets the plain authorization error, unchanged.
  const stranger = await createUser(app)
  const r5 = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${approval.id}/release`,
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(r5.statusCode, 403)
})
