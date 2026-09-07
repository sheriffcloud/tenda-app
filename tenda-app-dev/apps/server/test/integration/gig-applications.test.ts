/**
 * The application routes end-to-end: apply, withdraw, the poster's shortlist,
 * and the caller's own list.
 *
 * The negatives matter more than the positives here — the shortlist reveals
 * who else is competing, and the withdraw path must not be aimable at someone
 * else's row. Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import {
  APPLICATION_MESSAGE_MAX_LENGTH,
  ErrorCode,
  PLATFORM_CONFIG_DEFAULTS,
} from '@tenda/shared'
import { escrows, gig_applications } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createTransactableUser,
  createEscrow,
  attachGigDetails,
  authHeader,
  setPlatformConfig,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

type App = ReturnType<typeof getApp>

async function approvalGig(
  app: App,
  creator_id: string,
  overrides = {},
  details: Parameters<typeof attachGigDetails>[2] = {},
) {
  const escrow = await createEscrow(app, {
    creator_id,
    status: 'open',
    requires_approval: true,
    escrow_ref: `ref-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  })
  await attachGigDetails(app, escrow.id, details)
  return escrow
}

const apply = (app: App, token: string, id: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/v1/gigs/${id}/applications`,
    headers: authHeader(token),
    payload: body,
  })

const withdraw = (app: App, token: string, id: string) =>
  app.inject({ method: 'DELETE', url: `/v1/gigs/${id}/applications`, headers: authHeader(token) })

const shortlist = (app: App, token: string, id: string) =>
  app.inject({ method: 'GET', url: `/v1/gigs/${id}/applications`, headers: authHeader(token) })

// ---------- apply -----------------------------------------------------------

test('apply: creates an open application with a TTL from config', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)

  const res = await apply(app, worker.token, gig.id, { message: '  I can start today  ' })
  assert.strictEqual(res.statusCode, 201)
  const body = res.json()
  assert.strictEqual(body.status, 'open')
  assert.strictEqual(body.message, 'I can start today', 'trimmed')
  assert.strictEqual(body.applicant_id, worker.row.id)
  assert.ok(new Date(body.expires_at).getTime() > Date.now())
})

test('apply: re-applying UPSERTS rather than stacking rows', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)

  const first = (await apply(app, worker.token, gig.id, { message: 'first' })).json()
  await withdraw(app, worker.token, gig.id)
  const second = (await apply(app, worker.token, gig.id, { message: 'second' })).json()

  assert.strictEqual(second.id, first.id, 'same row, revived')
  assert.strictEqual(second.status, 'open', 'withdrawing then re-applying re-opens it')
  assert.strictEqual(second.message, 'second')

  const rows = await app.db
    .select()
    .from(gig_applications)
    .where(eq(gig_applications.escrow_id, gig.id))
  assert.strictEqual(rows.length, 1)
})

test('apply: refused on an instant-mode gig — nothing could ever assign it', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: false,
    escrow_ref: 'ref-instant',
  })
  await attachGigDetails(app, gig.id, {})

  const res = await apply(app, worker.token, gig.id)
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'APPLICATIONS_NOT_OPEN')
})

test('apply: the poster cannot apply to their own gig', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const gig = await approvalGig(app, poster.row.id)
  const res = await apply(app, poster.token, gig.id)
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'CANNOT_ACCEPT_OWN_GIG')
})

test('apply: refused once the accept deadline has passed', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id, {
    accept_deadline: new Date(Date.now() - 1_000),
  })
  const res = await apply(app, worker.token, gig.id)
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'ACCEPT_DEADLINE_PASSED')
})

test('apply: an over-long message is rejected at the boundary', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)

  const tooLong = await apply(app, worker.token, gig.id, {
    message: 'x'.repeat(APPLICATION_MESSAGE_MAX_LENGTH + 1),
  })
  assert.strictEqual(tooLong.statusCode, 422)

  const atMax = await apply(app, worker.token, gig.id, {
    message: 'x'.repeat(APPLICATION_MESSAGE_MAX_LENGTH),
  })
  assert.strictEqual(atMax.statusCode, 201, 'exactly at the max is allowed')
})

test('apply: the open-application cap blocks a new gig but not editing an existing pitch', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  await setPlatformConfig(app, { max_open_applications: 1 })

  const first = await approvalGig(app, poster.row.id)
  const second = await approvalGig(app, poster.row.id)

  assert.strictEqual((await apply(app, worker.token, first.id)).statusCode, 201)

  const blocked = await apply(app, worker.token, second.id)
  assert.strictEqual(blocked.statusCode, 403)
  assert.strictEqual(blocked.json().code, 'APPLICATION_LIMIT_REACHED')

  // Editing the pitch on the gig they already applied to consumes no new slot.
  const edit = await apply(app, worker.token, first.id, { message: 'updated' })
  assert.strictEqual(edit.statusCode, 201, 'an upsert must not be capped as a new application')
})

// ---------- withdraw --------------------------------------------------------

test('withdraw: settles the caller own row, and is not repeatable', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)
  await apply(app, worker.token, gig.id)

  const first = await withdraw(app, worker.token, gig.id)
  assert.strictEqual(first.statusCode, 200)
  assert.deepStrictEqual(first.json(), { withdrawn: true })

  const again = await withdraw(app, worker.token, gig.id)
  assert.strictEqual(again.statusCode, 409, 'already settled — not a silent success')
  assert.strictEqual(again.json().code, 'APPLICATION_NOT_OPEN')
})

test('withdraw: 404 when the caller never applied', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const stranger = await createUser(app)
  const gig = await approvalGig(app, poster.row.id)
  const res = await withdraw(app, stranger.token, gig.id)
  assert.strictEqual(res.statusCode, 404)
})

// The route takes no application id, so there is no way to aim it at someone
// else's row. This pins that: A withdrawing touches nothing of B's.
test('withdraw: cannot reach another worker application', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const workerA = await createTransactableUser(app)
  const workerB = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)
  await apply(app, workerA.token, gig.id)
  const bRow = (await apply(app, workerB.token, gig.id)).json()

  await withdraw(app, workerA.token, gig.id)

  const [b] = await app.db
    .select({ status: gig_applications.status })
    .from(gig_applications)
    .where(eq(gig_applications.id, bRow.id))
  assert.strictEqual(b.status, 'open')
})

// ---------- shortlist -------------------------------------------------------

test('shortlist: the poster sees applicants with their profile', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app, { first_name: 'Pat' })
  const worker = await createTransactableUser(app, { first_name: 'Wanda', last_name: 'Okoro' })
  const gig = await approvalGig(app, poster.row.id)
  await apply(app, worker.token, gig.id, { message: 'keen' })

  const res = await shortlist(app, poster.token, gig.id)
  assert.strictEqual(res.statusCode, 200)
  const [row] = res.json().data
  assert.strictEqual(row.applicant_id, worker.row.id)
  assert.strictEqual(row.first_name, 'Wanda')
  assert.strictEqual(row.last_name, 'Okoro')
  assert.strictEqual(row.message, 'keen')
})

// A rival applicant must not learn who else is competing.
test('shortlist: refused to anyone but the poster, including an applicant', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const stranger = await createUser(app)
  const gig = await approvalGig(app, poster.row.id)
  await apply(app, worker.token, gig.id)

  for (const who of [worker, stranger]) {
    const res = await shortlist(app, who.token, gig.id)
    assert.strictEqual(res.statusCode, 403, 'only the poster')
  }
})

test('shortlist: defaults to open rows, and rejects an unknown status filter', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)
  await apply(app, worker.token, gig.id)
  await withdraw(app, worker.token, gig.id)

  const defaulted = await shortlist(app, poster.token, gig.id)
  assert.deepStrictEqual(defaulted.json().data, [], 'withdrawn rows are not live applicants')

  const explicit = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${gig.id}/applications?status=withdrawn`,
    headers: authHeader(poster.token),
  })
  assert.strictEqual(explicit.json().data.length, 1)

  const bad = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${gig.id}/applications?status=nonsense`,
    headers: authHeader(poster.token),
  })
  assert.strictEqual(bad.statusCode, 400)
})

// ---------- the caller's own list -------------------------------------------

test('GET /v1/applications: returns the caller own rows with the gig attached', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const other = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id, {}, { title: 'Paint the fence' })
  // Both asserted: a silently-refused rival apply would leave ONE row in the
  // table and hollow the caller-scoping claim below into a tautology.
  assert.strictEqual((await apply(app, worker.token, gig.id)).statusCode, 201)
  assert.strictEqual((await apply(app, other.token, gig.id)).statusCode, 201)

  const res = await app.inject({
    method: 'GET',
    url: '/v1/applications',
    headers: authHeader(worker.token),
  })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.total, 1, 'only the caller own applications')
  assert.strictEqual(body.data[0].application.applicant_id, worker.row.id)
  assert.strictEqual(body.data[0].gig.escrow_id, gig.id)
  assert.strictEqual(body.data[0].gig.title, 'Paint the fence')
  // The gig summary must not carry the application's aliased columns.
  assert.strictEqual(body.data[0].gig.application_id, undefined)
  assert.strictEqual(body.data[0].gig.application_status, undefined)
})

test('GET /v1/applications: default PLATFORM ttl is reflected on the row', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)
  const created = (await apply(app, worker.token, gig.id)).json()

  const ttlMs = PLATFORM_CONFIG_DEFAULTS.application_ttl_seconds * 1_000
  const delta = new Date(created.expires_at).getTime() - Date.now()
  assert.ok(Math.abs(delta - ttlMs) < 60_000, `expiry should sit ~ttl away, got ${delta}ms`)
})

// ---------- malformed ids ---------------------------------------------------
// Postgres rejects a bad uuid at the driver, so without an id guard every one
// of these was a 500 — a client typo must be a 404, not a server error.

test('a malformed gig id is a 404 on every application route, never a 500', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const url = '/v1/gigs/not-a-uuid/applications'

  for (const method of ['GET', 'POST', 'DELETE'] as const) {
    const res = await app.inject({
      method,
      url,
      headers: authHeader(user.token),
      ...(method === 'POST' ? { payload: {} } : {}),
    })
    assert.strictEqual(res.statusCode, 404, `${method} ${url} → ${res.statusCode}`)
  }
})

test('the shortlist status filter narrows through the shared guard', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)
  await apply(app, worker.token, gig.id)

  // Whitespace around a valid value is tolerated…
  const spaced = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${gig.id}/applications?status= open `,
    headers: authHeader(poster.token),
  })
  assert.strictEqual(spaced.statusCode, 200)
  assert.strictEqual(spaced.json().data.length, 1)

  // …and every invalid value is named, not just the first.
  const bad = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${gig.id}/applications?status=open,bogus,alsobad`,
    headers: authHeader(poster.token),
  })
  assert.strictEqual(bad.statusCode, 400)
  assert.match(bad.json().message, /bogus/)
  assert.match(bad.json().message, /alsobad/)
})

// ---------- the mode must be visible on the read surfaces -------------------
// Without this the client cannot tell which action a gig offers, and would
// show "Accept" on a gig that only takes applications.

test('the browse LIST exposes requires_approval, so the CTA can be right', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const approval = await approvalGig(app, poster.row.id, {}, { title: 'Approval gig' })
  const instant = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: false,
    escrow_ref: 'ref-list-instant',
  })
  await attachGigDetails(app, instant.id, { title: 'Instant gig' })

  const res = await app.inject({ method: 'GET', url: '/v1/gigs' })
  assert.strictEqual(res.statusCode, 200)
  const byId = new Map<string, boolean>(
    res.json().data.map((g: { escrow_id: string; requires_approval: boolean }) => [
      g.escrow_id,
      g.requires_approval,
    ]),
  )
  assert.strictEqual(byId.get(approval.id), true)
  assert.strictEqual(byId.get(instant.id), false)
})

test('the gig DETAIL exposes the mode and the poster action fields', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const gig = await approvalGig(app, poster.row.id, { unassign_window_seconds: 3_600 })

  const res = await app.inject({ method: 'GET', url: `/v1/gigs/${gig.id}` })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.requires_approval, true)
  // The poster's release countdown is derived client-side from these three,
  // exactly as both contracts derive it — so no extra endpoint is needed.
  assert.strictEqual(body.unassign_window_seconds, 3_600)
  assert.strictEqual(body.assignment_released_at, null)
  assert.ok('completion_duration_seconds' in body)
})

test('the detail reports a worker step-back once it happens', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)
  await app.db
    .update(escrows)
    .set({ status: 'accepted', counterparty_id: worker.row.id })
    .where(eq(escrows.id, gig.id))
  await app.inject({
    method: 'POST',
    url: `/v1/escrows/${gig.id}/release`,
    headers: authHeader(worker.token),
  })

  const res = await app.inject({ method: 'GET', url: `/v1/gigs/${gig.id}` })
  assert.ok(res.json().assignment_released_at, 'the poster can see they stepped back')
})

test('apply: a gig escrow with no listing satellite reads as 404, not a nameless gig', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  // No `attachGigDetails`: the escrow exists but nothing describes it.
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: true,
    escrow_ref: `ref-${Math.random().toString(36).slice(2)}`,
  })

  const res = await apply(app, worker.token, escrow.id)
  // It is not something a worker could have been shown, so "no such gig" is
  // the honest answer — and it keeps the poster's notice from ever having to
  // name a gig with no title.
  assert.strictEqual(res.statusCode, 404)
  assert.strictEqual(res.json().code, ErrorCode.GIG_NOT_FOUND)
})
