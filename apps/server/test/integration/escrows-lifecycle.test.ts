/**
 * CO2 route matrix — escrow lifecycle reads/writes:
 *   DELETE /v1/escrows/:id        (draft-only + pending-create TOCTOU guard)
 *   GET    /v1/escrows/:id        (caller derivation)
 *   POST/GET /v1/escrows/:id/proofs (status/counterparty guards + total cap +
 *                                    completion-notification gating)
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { escrows, tx_attempts, disputes } from '@tenda/shared/db/schema'
import type { QueueService, JobName, JobPayload } from '@server/plugins/queue'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  authHeader,
} from '../helpers/test-app'
import { partiedEscrow, disputedEscrow, proofUrl } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- queue spy -------------------------------------------------------

interface EnqueueCall {
  name: JobName
  payload: JobPayload[JobName]
}

/**
 * Replace the harness queue stub (which 501s) with a recorder so tests can
 * assert which notifications a route enqueued. Reinstalled per test → no
 * cross-test leakage.
 */
function installQueueSpy(app: FastifyInstance): EnqueueCall[] {
  const calls: EnqueueCall[] = []
  const spy: QueueService['enqueue'] = async (name, payload) => {
    calls.push({ name, payload })
    return { job_id: 'test-job' }
  }
  app.queue.enqueue = spy
  return calls
}

/** Type-narrowing filter for the notification enqueues (no casts). */
function notifications(
  calls: EnqueueCall[],
): { name: 'notifications'; payload: JobPayload['notifications'] }[] {
  return calls.filter(
    (c): c is { name: 'notifications'; payload: JobPayload['notifications'] } =>
      c.name === 'notifications',
  )
}

// ---------- DELETE /v1/escrows/:id ---------------------------------------------

test('DELETE /v1/escrows/:id: 403 for a non-creator', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const stranger = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id })
  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/escrows/${escrow.id}`,
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(res.statusCode, 403)
})

test('DELETE /v1/escrows/:id: 409 once published', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id, status: 'open' })
  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/escrows/${escrow.id}`,
    headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 409)
})

test('DELETE /v1/escrows/:id: 409 while a create ping is unsettled', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id })
  await app.db.insert(tx_attempts).values({
    user_id: u.row.id,
    escrow_id: escrow.id,
    action: 'create',
    tx_ref: `sig-pending-${escrow.id}`,
  })
  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/escrows/${escrow.id}`,
    headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 409)
})

test('DELETE /v1/escrows/:id: a FAILED create ping does not block, row is gone', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id })
  await app.db.insert(tx_attempts).values({
    user_id: u.row.id,
    escrow_id: escrow.id,
    action: 'create',
    tx_ref: `sig-failed-${escrow.id}`,
    failed_at: new Date(),
    failure_code: 'tx_failed',
  })
  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/escrows/${escrow.id}`,
    headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 200)
  const rows = await app.db.select().from(escrows).where(eq(escrows.id, escrow.id))
  assert.strictEqual(rows.length, 0)
})

// ---------- GET /v1/escrows/:id --------------------------------------------------

test('GET /v1/escrows/:id: 403 for a stranger, 200 for a dispute_admin', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const stranger = await createUser(app)
  const admin = await createUser(app, { role: 'dispute_admin' })
  const escrow = await createEscrow(app, { creator_id: creator.row.id })

  const denied = await app.inject({
    method: 'GET',
    url: `/v1/escrows/${escrow.id}`,
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(denied.statusCode, 403)

  const allowed = await app.inject({
    method: 'GET',
    url: `/v1/escrows/${escrow.id}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(allowed.statusCode, 200)
  assert.strictEqual(allowed.json().escrow.id, escrow.id)
})

// ---------- proofs ----------------------------------------------------------------

test('POST proofs: 409 while the escrow is open', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [{ url: proofUrl(worker.row.id, 1), type: 'image' }] },
  })
  assert.strictEqual(res.statusCode, 409)
})

test('POST proofs: 403 for anyone but the counterparty (creator included)', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'accepted')
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(creator.token),
    payload: { proofs: [{ url: proofUrl(creator.row.id, 1), type: 'image' }] },
  })
  assert.strictEqual(res.statusCode, 403)
})

test('POST proofs: 400 on an empty batch', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await partiedEscrow(app, 'accepted')
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [] },
  })
  assert.strictEqual(res.statusCode, 400)
})

test('POST proofs: 400 on a foreign-folder Cloudinary URL', { skip }, async () => {
  const app = getApp()
  const { creator, worker, escrow } = await partiedEscrow(app, 'accepted')
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [{ url: proofUrl(creator.row.id, 1), type: 'image' }] },
  })
  assert.strictEqual(res.statusCode, 400)
})

test('POST proofs: total cap of 20 holds across submissions', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await partiedEscrow(app, 'accepted')
  const batch = (from: number, n: number) => ({
    proofs: Array.from({ length: n }, (_, i) => ({
      url: proofUrl(worker.row.id, from + i),
      type: 'image',
    })),
  })
  const first = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: batch(0, 19),
  })
  assert.strictEqual(first.statusCode, 201)
  const overflow = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: batch(19, 2),
  })
  assert.strictEqual(overflow.statusCode, 400)
  const exact = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: batch(19, 1),
  })
  assert.strictEqual(exact.statusCode, 201)
})

test('GET proofs: parties read, strangers 403', { skip }, async () => {
  const app = getApp()
  const { creator, worker, escrow } = await partiedEscrow(app, 'accepted')
  const stranger = await createUser(app)
  await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [{ url: proofUrl(worker.row.id, 1), type: 'image' }] },
  })
  const ok = await app.inject({
    method: 'GET',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(ok.statusCode, 200)
  assert.strictEqual(ok.json().length, 1)
  const denied = await app.inject({
    method: 'GET',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(denied.statusCode, 403)
})

// ---------- proof-upload notification gating --------------------------------
// An `accepted`-state upload is PRE-SUBMIT staging (the worker uploads, THEN
// broadcasts the submit tx, which may fail), so it must NOT notify the poster
// of a completion that never confirmed on-chain. The genuine "Work submitted"
// push rides verify-tx republish once the submit tx confirms. Only additional
// evidence while `submitted` (poster already reviewing) notifies here.

test('POST proofs while accepted: persists but does NOT notify (pre-submit staging)', { skip }, async () => {
  const app = getApp()
  const calls = installQueueSpy(app)
  const { worker, escrow } = await partiedEscrow(app, 'accepted')
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [{ url: proofUrl(worker.row.id, 1), type: 'image' }] },
  })
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(res.json().length, 1, 'proof is persisted even without a notification')
  assert.strictEqual(
    notifications(calls).length,
    0,
    'accepted-state upload must not notify — the submit tx has not confirmed',
  )
})

test('POST proofs while submitted: notifies the creator exactly once', { skip }, async () => {
  const app = getApp()
  const calls = installQueueSpy(app)
  const { creator, worker, escrow } = await partiedEscrow(app, 'submitted')
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [{ url: proofUrl(worker.row.id, 2), type: 'image' }] },
  })
  assert.strictEqual(res.statusCode, 201)
  const notifs = notifications(calls)
  assert.strictEqual(notifs.length, 1, 'additional evidence during review notifies once')
  assert.strictEqual(notifs[0].payload.user_id, creator.row.id, 'the poster is the recipient')
  assert.strictEqual(notifs[0].payload.title, 'Additional proof submitted')
  // `kind` is now always present: an exchange escrow's proof notice must
  // deep-link /exchange/:id, and omitting kind silently routed it to /gig/:id.
  assert.deepStrictEqual(notifs[0].payload.data, {
    screen: 'escrow',
    escrowId: escrow.id,
    kind: 'gig',
  })
})

// ---------- proofs during a dispute -----------------------------------------
// The worker keeps supplying evidence for the mediator until the dispute
// resolves — off-chain, no status change — and it deep-links recipients to the
// shared mediation thread where the proof now shows.

test('POST proofs while disputed: the counterparty can still add evidence', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await disputedEscrow(app)
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [{ url: proofUrl(worker.row.id, 1), type: 'image' }] },
  })
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(res.json().length, 1, 'dispute evidence is persisted')
})

test('POST proofs while disputed: only the counterparty — creator and strangers get 403', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await disputedEscrow(app)
  const stranger = await createUser(app)
  for (const who of [creator, stranger]) {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/escrows/${escrow.id}/proofs`,
      headers: authHeader(who.token),
      payload: { proofs: [{ url: proofUrl(who.row.id, 1), type: 'image' }] },
    })
    assert.strictEqual(res.statusCode, 403)
  }
})

test('POST proofs while disputed: notifies the other party AND the assigned mediator, into the thread', { skip }, async () => {
  const app = getApp()
  const calls = installQueueSpy(app)
  const { creator, worker, escrow, dispute_id } = await disputedEscrow(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })
  await app.db.update(disputes).set({ assigned_to: mediator.row.id }).where(eq(disputes.id, dispute_id))

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [{ url: proofUrl(worker.row.id, 2), type: 'image' }] },
  })
  assert.strictEqual(res.statusCode, 201)
  const notifs = notifications(calls)
  assert.deepStrictEqual(
    notifs.map((n) => n.payload.user_id).sort(),
    [creator.row.id, mediator.row.id].sort(),
    'both the other party and the mediator are alerted',
  )
  for (const n of notifs) {
    assert.strictEqual(n.payload.title, 'New dispute evidence')
    // Both ids: mobile opens /dispute/:escrowId, the admin dashboard keys the
    // mediation queue by disputes.id.
    assert.deepStrictEqual(n.payload.data, {
      screen: 'dispute',
      escrowId: escrow.id,
      disputeId: dispute_id,
    })
  }
})

test('POST proofs while disputed with no mediator claimed: only the other party is notified', { skip }, async () => {
  const app = getApp()
  const calls = installQueueSpy(app)
  const { creator, worker, escrow } = await disputedEscrow(app) // assigned_to stays null
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [{ url: proofUrl(worker.row.id, 3), type: 'image' }] },
  })
  assert.strictEqual(res.statusCode, 201)
  const notifs = notifications(calls)
  assert.strictEqual(notifs.length, 1, 'no mediator → single recipient')
  assert.strictEqual(notifs[0].payload.user_id, creator.row.id)
  assert.strictEqual(notifs[0].payload.data?.screen, 'dispute')
})

test('POST proofs: 409 once completed (only accepted/submitted/disputed are proofable)', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await partiedEscrow(app, 'completed')
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token),
    payload: { proofs: [{ url: proofUrl(worker.row.id, 1), type: 'image' }] },
  })
  assert.strictEqual(res.statusCode, 409)
})
