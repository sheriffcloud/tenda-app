/**
 * CO8 featured rail (#78): admin curation (escrows.feature) + the public
 * cached rail at GET /v1/gigs/featured. Mutations invalidate the cache so
 * curation shows immediately.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachExchangeDetails,
  authHeader,
} from '../helpers/test-app'
import { openGig } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const HOUR = 3_600_000

function window(offsetMsFromNow: number, durationMs = 2 * HOUR) {
  const starts = new Date(Date.now() + offsetMsFromNow)
  return { starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + durationMs).toISOString() }
}

async function feature(escrow_id: string, token: string, overrides: Record<string, unknown> = {}) {
  const app = getApp()
  return app.inject({
    method: 'POST',
    url: '/v1/admin/featured',
    headers: authHeader(token),
    payload: { escrow_id, ...window(-HOUR), ...overrides },
  })
}

test('featured: curation needs escrows.feature — dispute_admin 403', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app)
  const lesser = await createUser(app, { role: 'dispute_admin' })
  const res = await feature(escrow.id, lesser.token)
  assert.strictEqual(res.statusCode, 403)
})

test('featured: validation — bad window, bad position, exchange escrow, unknown escrow', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const { escrow } = await openGig(app)

  const inverted = await feature(escrow.id, admin.token, {
    starts_at: new Date(Date.now() + HOUR).toISOString(),
    ends_at: new Date(Date.now() - HOUR).toISOString(),
  })
  assert.strictEqual(inverted.statusCode, 400)

  const badPos = await feature(escrow.id, admin.token, { position: -1 })
  assert.strictEqual(badPos.statusCode, 400)

  const creator = await createUser(app)
  const offer = await createEscrow(app, { creator_id: creator.row.id, kind: 'exchange', status: 'open' })
  await attachExchangeDetails(app, offer.id)
  const wrongKind = await feature(offer.id, admin.token)
  assert.strictEqual(wrongKind.statusCode, 422)

  const missing = await feature('f0e36d8a-0000-0000-0000-000000000000', admin.token)
  assert.strictEqual(missing.statusCode, 404)
})

test('featured: rail serves active windows position-ordered, cache invalidates on mutate', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const a = await openGig(app, { title: 'First gig' })
  const b = await openGig(app, { title: 'Second gig' })
  const c = await openGig(app, { title: 'Future gig' })

  // warm the cache empty — the create must still show immediately
  const cold = await app.inject({ method: 'GET', url: '/v1/gigs/featured' })
  assert.deepStrictEqual(cold.json().data, [])

  assert.strictEqual((await feature(a.escrow.id, admin.token, { position: 2 })).statusCode, 201)
  assert.strictEqual((await feature(b.escrow.id, admin.token, { position: 1 })).statusCode, 201)
  // scheduled for later — must NOT surface yet
  assert.strictEqual((await feature(c.escrow.id, admin.token, { ...window(HOUR) })).statusCode, 201)

  const rail = await app.inject({ method: 'GET', url: '/v1/gigs/featured' })
  assert.strictEqual(rail.statusCode, 200)
  assert.deepStrictEqual(
    rail.json().data.map((g: { title: string }) => g.title),
    ['Second gig', 'First gig'],
  )
})

test('featured: hidden and non-open listings drop off the rail', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const { escrow } = await openGig(app)
  await feature(escrow.id, admin.token)

  await app.inject({
    method: 'PATCH',
    url: `/v1/admin/escrows/${escrow.id}/hidden`,
    headers: authHeader(admin.token),
    payload: { hidden: true },
  })
  // takedown does not invalidate the rail cache — the 60s TTL covers it;
  // here a fresh slot mutation flushes it deterministically.
  const other = await openGig(app)
  await feature(other.escrow.id, admin.token)

  const rail = await app.inject({ method: 'GET', url: '/v1/gigs/featured' })
  const ids = rail.json().data.map((g: { escrow_id: string }) => g.escrow_id)
  assert.ok(!ids.includes(escrow.id))
  assert.ok(ids.includes(other.escrow.id))
})

test('featured: duplicate slots for one listing dedupe in the rail', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const { escrow } = await openGig(app)
  await feature(escrow.id, admin.token, { position: 0 })
  await feature(escrow.id, admin.token, { position: 5 })

  const rail = await app.inject({ method: 'GET', url: '/v1/gigs/featured' })
  assert.strictEqual(rail.json().data.length, 1)
})

test('featured: PATCH reschedules, DELETE removes; admin list shows upcoming', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const { escrow } = await openGig(app)
  const created = await feature(escrow.id, admin.token)
  const slotId = created.json().id

  // push the window into the future → rail empties
  const patched = await app.inject({
    method: 'PATCH',
    url: `/v1/admin/featured/${slotId}`,
    headers: authHeader(admin.token),
    payload: window(HOUR),
  })
  assert.strictEqual(patched.statusCode, 200)
  const empty = await app.inject({ method: 'GET', url: '/v1/gigs/featured' })
  assert.deepStrictEqual(empty.json().data, [])

  const list = await app.inject({
    method: 'GET',
    url: '/v1/admin/featured',
    headers: authHeader(admin.token),
  })
  assert.strictEqual(list.json().data.length, 1)
  assert.strictEqual(list.json().data[0].title, 'Open gig')

  const removed = await app.inject({
    method: 'DELETE',
    url: `/v1/admin/featured/${slotId}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(removed.statusCode, 200)
  const gone = await app.inject({
    method: 'DELETE',
    url: `/v1/admin/featured/${slotId}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(gone.statusCode, 404)
})

test('featured: PATCH negatives — 404 unknown slot, inverted window 400', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })

  const missing = await app.inject({
    method: 'PATCH',
    url: '/v1/admin/featured/f0e36d8a-0000-0000-0000-000000000000',
    headers: authHeader(admin.token),
    payload: window(HOUR),
  })
  assert.strictEqual(missing.statusCode, 404)

  const { escrow } = await openGig(app)
  const created = await feature(escrow.id, admin.token)
  const inverted = await app.inject({
    method: 'PATCH',
    url: `/v1/admin/featured/${created.json().id}`,
    headers: authHeader(admin.token),
    payload: {
      starts_at: new Date(Date.now() + 2 * HOUR).toISOString(),
      ends_at: new Date(Date.now() + HOUR).toISOString(),
    },
  })
  assert.strictEqual(inverted.statusCode, 400)
})
