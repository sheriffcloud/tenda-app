/**
 * CO7 claim-based dispute assignment (#77):
 *   POST /v1/admin/disputes/:id/claim — atomic take from the open pool
 *   POST /v1/admin/disputes/:id/release — claimer (or super_admin) returns it
 *   GET  /v1/admin/disputes?assigned=me|none — caseload vs pool views
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { disputes } from '@tenda/shared/db/schema'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'
import { disputedEscrow } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('claim: takes an open dispute; rival claim 409; self re-claim 200', { skip }, async () => {
  const app = getApp()
  const { dispute_id } = await disputedEscrow(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })
  const rival = await createUser(app, { role: 'dispute_admin' })

  const claim = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(claim.statusCode, 200)
  assert.strictEqual(claim.json().assigned_to_id, mediator.row.id)

  const contested = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(rival.token),
  })
  assert.strictEqual(contested.statusCode, 409)
  assert.strictEqual(contested.json().code, 'DISPUTE_ALREADY_CLAIMED')

  const again = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(again.statusCode, 200)
})

test('claim: 404 unknown, 409 resolved, 403 plain user', { skip }, async () => {
  const app = getApp()
  const mediator = await createUser(app, { role: 'dispute_admin' })
  const missing = await app.inject({
    method: 'POST',
    url: '/v1/admin/disputes/f0e36d8a-0000-0000-0000-000000000000/claim',
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(missing.statusCode, 404)

  const { dispute_id, creator } = await disputedEscrow(app)
  await app.db
    .update(disputes)
    .set({ resolved_at: new Date(), resolved_by: mediator.row.id, winner: 'creator' })
    .where(eq(disputes.id, dispute_id))
  const resolved = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(resolved.statusCode, 409)
  assert.strictEqual(resolved.json().code, 'DISPUTE_RESOLVED')

  const plain = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(plain.statusCode, 403)
})

// ── conflict of interest: a disputant may not mediate their own case ────────
// `deriveCaller` already ranks party identity above the dispute_admin role, so
// a party-admin cannot RESOLVE their own escrow. Claiming was the gap: the
// claim gates proposing a resolution and used to make the mediation thread
// present the claim holder as the neutral mediator.

test('claim: an admin who is the escrow CREATOR is refused', { skip }, async () => {
  const app = getApp()
  const { dispute_id, creator } = await disputedEscrow(app, {}, { creatorRole: 'dispute_admin' })

  const claim = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(claim.statusCode, 403)
  assert.strictEqual(claim.json().code, 'FORBIDDEN')

  // The dispute stays in the open pool for an impartial mediator.
  const [row] = await app.db.select().from(disputes).where(eq(disputes.id, dispute_id))
  assert.strictEqual(row.assigned_to, null)
})

test('claim: an admin who is the COUNTERPARTY is refused', { skip }, async () => {
  const app = getApp()
  const { dispute_id, worker } = await disputedEscrow(app, {}, { workerRole: 'super_admin' })

  const claim = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(worker.token),
  })
  assert.strictEqual(claim.statusCode, 403)
  assert.strictEqual(claim.json().code, 'FORBIDDEN')
})

test('claim: the refusal is scoped to the case, not the admin', { skip }, async () => {
  // The same admin still mediates every dispute they are NOT a party to.
  const app = getApp()
  const own = await disputedEscrow(app, {}, { creatorRole: 'dispute_admin' })
  const other = await disputedEscrow(app)

  const mine = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${own.dispute_id}/claim`,
    headers: authHeader(own.creator.token),
  })
  assert.strictEqual(mine.statusCode, 403)

  const theirs = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${other.dispute_id}/claim`,
    headers: authHeader(own.creator.token),
  })
  assert.strictEqual(theirs.statusCode, 200)
  assert.strictEqual(theirs.json().assigned_to_id, own.creator.row.id)
})

test('claim: a party-admin keeps full access to their own dispute thread', { skip }, async () => {
  // The guard must refuse the MEDIATOR seat without locking a disputant out of
  // their own case — they are still a party, and parties read and post freely.
  const app = getApp()
  const { escrow, creator } = await disputedEscrow(app, {}, { creatorRole: 'dispute_admin' })

  const read = await app.inject({
    method: 'GET',
    url: `/v1/escrows/${escrow.id}/dispute/messages`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(read.statusCode, 200)

  const post = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/dispute/messages`,
    headers: authHeader(creator.token),
    payload: { body: 'Here is my side of it.' },
  })
  assert.strictEqual(post.statusCode, 201)
})

test('claim: a party-admin cannot propose a resolution on their own dispute', { skip }, async () => {
  // Downstream of the guard: proposing requires holding the claim.
  const app = getApp()
  const { dispute_id, creator } = await disputedEscrow(app, {}, { creatorRole: 'dispute_admin' })

  const propose = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/resolution`,
    headers: authHeader(creator.token),
    payload: { winner: 'creator' },
  })
  assert.strictEqual(propose.statusCode, 403)
  assert.strictEqual(propose.json().code, 'DISPUTE_NOT_CLAIMED')
})

test('claim: the party guard runs BEFORE the resolved check — 403, not 409', { skip }, async () => {
  // Ordering is deliberate and nothing else pins it. Eligibility is a property
  // of the CALLER, not of the dispute's state: a party can never mediate this
  // case, so answering DISPUTE_RESOLVED would imply "if it were still open you
  // could claim it", which is false. (It is NOT about withholding state — the
  // refused caller is a party and already knows their own dispute is resolved.)
  const app = getApp()
  const { dispute_id, creator } = await disputedEscrow(app, {}, { creatorRole: 'dispute_admin' })
  const outsider = await createUser(app, { role: 'dispute_admin' })
  await app.db
    .update(disputes)
    .set({ resolved_at: new Date(), winner: 'creator' })
    .where(eq(disputes.id, dispute_id))

  const party = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(party.statusCode, 403)
  assert.strictEqual(party.json().code, 'FORBIDDEN')

  // Same dispute, same resolved state, an impartial admin: the resolved check
  // IS reached. Swapping the two checks would make both callers answer 409.
  const impartial = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(outsider.token),
  })
  assert.strictEqual(impartial.statusCode, 409)
  assert.strictEqual(impartial.json().code, 'DISPUTE_RESOLVED')
})

test('release: an unknown dispute is a 404, not a silent success', { skip }, async () => {
  const app = getApp()
  const mediator = await createUser(app, { role: 'dispute_admin' })

  const missing = await app.inject({
    method: 'POST',
    url: '/v1/admin/disputes/f0e36d8a-0000-0000-0000-000000000000/release',
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(missing.statusCode, 404)
  assert.strictEqual(missing.json().code, 'NOT_FOUND')
})

test('release: claimer releases; rival 403; super_admin force-releases; idempotent', { skip }, async () => {
  const app = getApp()
  const { dispute_id } = await disputedEscrow(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })
  const rival = await createUser(app, { role: 'dispute_admin' })
  const root = await createUser(app, { role: 'super_admin' })
  const claimUrl = `/v1/admin/disputes/${dispute_id}/claim`
  const releaseUrl = `/v1/admin/disputes/${dispute_id}/release`

  await app.inject({ method: 'POST', url: claimUrl, headers: authHeader(mediator.token) })

  const denied = await app.inject({ method: 'POST', url: releaseUrl, headers: authHeader(rival.token) })
  assert.strictEqual(denied.statusCode, 403)

  const released = await app.inject({ method: 'POST', url: releaseUrl, headers: authHeader(mediator.token) })
  assert.strictEqual(released.statusCode, 200)
  assert.strictEqual(released.json().assigned_to_id, null)

  // idempotent re-release of an unclaimed dispute
  const again = await app.inject({ method: 'POST', url: releaseUrl, headers: authHeader(mediator.token) })
  assert.strictEqual(again.statusCode, 200)

  // super_admin can force-release someone else's claim
  await app.inject({ method: 'POST', url: claimUrl, headers: authHeader(mediator.token) })
  const forced = await app.inject({ method: 'POST', url: releaseUrl, headers: authHeader(root.token) })
  assert.strictEqual(forced.statusCode, 200)
})

test('list: assigned=me and assigned=none partition the queue', { skip }, async () => {
  const app = getApp()
  const a = await disputedEscrow(app)
  await disputedEscrow(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })
  await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${a.dispute_id}/claim`,
    headers: authHeader(mediator.token),
  })

  const mine = await app.inject({
    method: 'GET',
    url: '/v1/admin/disputes?assigned=me',
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(mine.json().total, 1)
  assert.strictEqual(mine.json().data[0].dispute_id, a.dispute_id)
  assert.strictEqual(mine.json().data[0].assigned_to_id, mediator.row.id)

  const pool = await app.inject({
    method: 'GET',
    url: '/v1/admin/disputes?assigned=none',
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(pool.json().total, 1)
  assert.notStrictEqual(pool.json().data[0].dispute_id, a.dispute_id)
})

test('list: names the mediator holding a case without dropping unclaimed rows', { skip }, async () => {
  const app = getApp()
  const held = await disputedEscrow(app)
  await disputedEscrow(app) // stays in the open pool
  const mediator = await createUser(app, {
    role: 'dispute_admin',
    first_name: 'Mo',
    last_name: 'Mediator',
  })
  await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${held.dispute_id}/claim`,
    headers: authHeader(mediator.token),
  })

  const res = await app.inject({
    method: 'GET',
    url: '/v1/admin/disputes',
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()

  // The mediator join MUST be a LEFT join. An inner join silently drops every
  // unclaimed dispute, and because the count query does not join `users` at
  // all, the failure shows up as total=2 alongside an empty/short data array
  // rather than as an error — so assert the two agree.
  assert.strictEqual(body.total, 2)
  assert.strictEqual(body.data.length, 2)

  const claimed = body.data.find((d: { dispute_id: string }) => d.dispute_id === held.dispute_id)
  assert.strictEqual(claimed.assigned_to_id, mediator.row.id)
  assert.strictEqual(claimed.assigned_to_first_name, 'Mo')
  assert.strictEqual(claimed.assigned_to_last_name, 'Mediator')

  // An unclaimed row carries explicit nulls, not a neighbour's name.
  const unclaimed = body.data.find((d: { dispute_id: string }) => d.dispute_id !== held.dispute_id)
  assert.strictEqual(unclaimed.assigned_to_id, null)
  assert.strictEqual(unclaimed.assigned_to_first_name, null)
  assert.strictEqual(unclaimed.assigned_to_last_name, null)
})

test('list: party filters to every dispute a given user is involved in', { skip }, async () => {
  const app = getApp()
  const mine = await disputedEscrow(app)
  await disputedEscrow(app) // unrelated dispute, must not match
  const admin = await createUser(app, { role: 'dispute_admin' })

  // The creator is a party.
  const byCreator = await app.inject({
    method: 'GET',
    url: `/v1/admin/disputes?party=${mine.creator.row.id}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(byCreator.json().total, 1)
  assert.strictEqual(byCreator.json().data[0].dispute_id, mine.dispute_id)

  // The worker (counterparty) is a party too.
  const byWorker = await app.inject({
    method: 'GET',
    url: `/v1/admin/disputes?party=${mine.worker.row.id}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(byWorker.json().total, 1)
  assert.strictEqual(byWorker.json().data[0].dispute_id, mine.dispute_id)

  // A user party to nothing gets an empty queue.
  const stranger = await createUser(app)
  const none = await app.inject({
    method: 'GET',
    url: `/v1/admin/disputes?party=${stranger.row.id}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(none.json().total, 0)
})

// ── A15 (#81): demotion auto-releases claimed disputes ──────────────────────

test('demotion: role losing disputes.mediate releases unresolved claims, keeps resolved', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  const mediator = await createUser(app, { role: 'dispute_admin' })
  const live = await disputedEscrow(app)
  const closed = await disputedEscrow(app)

  for (const d of [live, closed]) {
    const claim = await app.inject({
      method: 'POST',
      url: `/v1/admin/disputes/${d.dispute_id}/claim`,
      headers: authHeader(mediator.token),
    })
    assert.strictEqual(claim.statusCode, 200)
  }
  // Resolve one while still claimed — its assignee is audit history.
  await app.db
    .update(disputes)
    .set({ resolved_at: new Date(), resolved_by: mediator.row.id, winner: 'creator' })
    .where(eq(disputes.id, closed.dispute_id))

  const demote = await app.inject({
    method: 'PATCH',
    url: `/v1/admin/users/${mediator.row.id}/role`,
    headers: authHeader(root.token),
    payload: { role: 'user' },
  })
  assert.strictEqual(demote.statusCode, 200)
  assert.strictEqual(demote.json().role, 'user')

  const [liveRow] = await app.db.select().from(disputes).where(eq(disputes.id, live.dispute_id))
  assert.strictEqual(liveRow.assigned_to, null)
  assert.strictEqual(liveRow.assigned_at, null)

  const [closedRow] = await app.db.select().from(disputes).where(eq(disputes.id, closed.dispute_id))
  assert.strictEqual(closedRow.assigned_to, mediator.row.id)

  // The released dispute is back in the open pool for other mediators.
  const other = await createUser(app, { role: 'dispute_admin' })
  const pool = await app.inject({
    method: 'GET',
    url: '/v1/admin/disputes?assigned=none',
    headers: authHeader(other.token),
  })
  const poolIds = pool.json().data.map((d: { dispute_id: string }) => d.dispute_id)
  assert.ok(poolIds.includes(live.dispute_id))
  assert.ok(!poolIds.includes(closed.dispute_id))
})

// A7 (review pass): the resolve builder is guarded in the HANDLER (caller
// derivation + state machine), not by an /admin prefix — pin it over HTTP.
test('resolve: parties and outsiders 403; dispute_admin receives the unsigned tx', { skip }, async () => {
  const app = getApp()
  const { escrow, creator } = await disputedEscrow(app)
  const outsider = await createUser(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })
  const resolve = (token: string) =>
    app.inject({
      method: 'POST',
      url: `/v1/escrows/${escrow.id}/resolve`,
      headers: authHeader(token),
      payload: { winner: 'creator' },
    })

  assert.strictEqual((await resolve(creator.token)).statusCode, 403)
  assert.strictEqual((await resolve(outsider.token)).statusCode, 403)

  const ok = await resolve(mediator.token)
  assert.strictEqual(ok.statusCode, 200)
  assert.ok(ok.json().unsigned, 'dispute_admin gets the unsigned resolve tx')
})

test('demotion: role change that keeps disputes.mediate leaves claims intact', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  const mediator = await createUser(app, { role: 'super_admin' })
  const { dispute_id } = await disputedEscrow(app)

  await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(mediator.token),
  })

  const lateral = await app.inject({
    method: 'PATCH',
    url: `/v1/admin/users/${mediator.row.id}/role`,
    headers: authHeader(root.token),
    payload: { role: 'dispute_admin' },
  })
  assert.strictEqual(lateral.statusCode, 200)

  const [row] = await app.db.select().from(disputes).where(eq(disputes.id, dispute_id))
  assert.strictEqual(row.assigned_to, mediator.row.id)
})
