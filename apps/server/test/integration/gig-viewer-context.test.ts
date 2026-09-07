/**
 * GET /v1/gigs/:id — the `viewer` block.
 *
 * This is the field the mobile CTA reads to decide between Apply, Applied and
 * Withdraw, and the poster reads for the applicant count. It exists on the
 * server precisely because the client cannot compute it: /v1/applications is
 * paginated across every status the caller has ever held, so matching by
 * escrow id there silently misses a row on page two.
 *
 * The route is PUBLIC, so the negatives carry the weight: an anonymous read
 * must not gain a viewer block, a rival must not learn the applicant count,
 * and an expired bearer must not turn a shareable page into a 401.
 */
import { test } from 'node:test'
import assert from 'node:assert'
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

async function gig(app: App, creator_id: string, requires_approval: boolean) {
  const escrow = await createEscrow(app, {
    creator_id,
    status: 'open',
    requires_approval,
    escrow_ref: `ref-${Math.random().toString(36).slice(2)}`,
  })
  await attachGigDetails(app, escrow.id, {})
  return escrow
}

const detail = (app: App, id: string, token?: string) =>
  app.inject({
    method: 'GET',
    url: `/v1/gigs/${id}`,
    ...(token === undefined ? {} : { headers: authHeader(token) }),
  })

const applyTo = (app: App, token: string, id: string) =>
  app.inject({
    method: 'POST',
    url: `/v1/gigs/${id}/applications`,
    headers: authHeader(token),
    payload: {},
  })

test('anonymous read: the gig is public and the viewer block is null', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const escrow = await gig(app, poster.row.id, true)

  const res = await detail(app, escrow.id)
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.escrow_id, escrow.id)
  // Null, not an empty object: "nobody asked" and "asked and has nothing" are
  // different answers and the wire keeps them different.
  assert.strictEqual(body.viewer, null)
})

test('an unreadable bearer degrades to anonymous, it does not 401', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const escrow = await gig(app, poster.row.id, true)

  const res = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${escrow.id}`,
    headers: { authorization: 'Bearer not-a-real-token' },
  })
  // The gig detail is the target of every share link and push deep-link. A
  // stale session must not turn it into "Failed to load gig".
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().viewer, null)
})

test('a worker who has not applied: application null, count withheld', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await gig(app, poster.row.id, true)

  const body = (await detail(app, escrow.id, worker.token)).json()
  assert.deepStrictEqual(body.viewer, { application: null, open_application_count: null })
})

test('a worker who applied sees their OWN application, still no count', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await gig(app, poster.row.id, true)

  const applied = await applyTo(app, worker.token, escrow.id)
  assert.strictEqual(applied.statusCode, 201)

  const body = (await detail(app, escrow.id, worker.token)).json()
  assert.strictEqual(body.viewer.application.id, applied.json().id)
  assert.strictEqual(body.viewer.application.status, 'open')
  // The count is what tells a rival how contested the gig is — the same thing
  // the shortlist route refuses them.
  assert.strictEqual(body.viewer.open_application_count, null)
})

test('one applicant never sees another applicants row', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const first = await createUser(app)
  const second = await createUser(app)
  const escrow = await gig(app, poster.row.id, true)

  await applyTo(app, first.token, escrow.id)
  const body = (await detail(app, escrow.id, second.token)).json()
  assert.strictEqual(body.viewer.application, null)
  assert.strictEqual(body.viewer.open_application_count, null)
})

test('the poster gets the open count and never an application', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const first = await createUser(app)
  const second = await createUser(app)
  const escrow = await gig(app, poster.row.id, true)

  await applyTo(app, first.token, escrow.id)
  await applyTo(app, second.token, escrow.id)

  const body = (await detail(app, escrow.id, poster.token)).json()
  assert.strictEqual(body.viewer.open_application_count, 2)
  assert.strictEqual(body.viewer.application, null)
})

test('a withdrawn application stops counting toward the posters number', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await gig(app, poster.row.id, true)

  await applyTo(app, worker.token, escrow.id)
  await app.inject({
    method: 'DELETE',
    url: `/v1/gigs/${escrow.id}/applications`,
    headers: authHeader(worker.token),
  })

  const poster_view = (await detail(app, escrow.id, poster.token)).json()
  assert.strictEqual(poster_view.viewer.open_application_count, 0)
  // The applicant still sees their own row — it is their history, and it is
  // what tells the CTA they may apply again.
  const worker_view = (await detail(app, escrow.id, worker.token)).json()
  assert.strictEqual(worker_view.viewer.application.status, 'withdrawn')
})

test('instant-mode gigs answer without querying: no application, count 0 for the poster', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await gig(app, poster.row.id, false)

  const poster_view = (await detail(app, escrow.id, poster.token)).json()
  assert.deepStrictEqual(poster_view.viewer, { application: null, open_application_count: 0 })
  const worker_view = (await detail(app, escrow.id, worker.token)).json()
  assert.deepStrictEqual(worker_view.viewer, { application: null, open_application_count: null })
})

test('a draft still 404s for a stranger and loads for its creator', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const stranger = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'draft',
    requires_approval: true,
  })
  await attachGigDetails(app, escrow.id, {})

  // The lenient viewer decoration must not have weakened the private-row path.
  assert.strictEqual((await detail(app, escrow.id)).statusCode, 404)
  assert.strictEqual((await detail(app, escrow.id, stranger.token)).statusCode, 404)
  const mine = await detail(app, escrow.id, poster.token)
  assert.strictEqual(mine.statusCode, 200)
  assert.strictEqual(mine.json().viewer.open_application_count, 0)
})
