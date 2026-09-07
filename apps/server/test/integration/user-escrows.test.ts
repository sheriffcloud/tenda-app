/**
 * #98 gap-fill — GET /v1/users/:id/escrows (own escrows, gigs + exchanges):
 *   own-only guard, role (creator/counterparty) + kind filters, newest-first.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED, useTestApp, createUser, createEscrow, attachGigDetails, authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('GET /v1/users/:id/escrows: 403 fetching another user’s escrows', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const res = await app.inject({ method: 'GET', url: `/v1/users/${b.row.id}/escrows`, headers: authHeader(a.token) })
  assert.strictEqual(res.statusCode, 403)
})

test('GET /v1/users/:id/escrows: returns the caller’s escrows as creator and counterparty', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const other = await createUser(app)
  const mine = await createEscrow(app, { creator_id: me.row.id })
  await attachGigDetails(app, mine.id, { title: 'My gig' })
  const working = await createEscrow(app, { creator_id: other.row.id, counterparty_id: me.row.id, status: 'accepted' })
  await attachGigDetails(app, working.id, { title: 'Working on' })

  const res = await app.inject({ method: 'GET', url: `/v1/users/${me.row.id}/escrows`, headers: authHeader(me.token) })
  assert.strictEqual(res.statusCode, 200)
  const ids = res.json().data.map((r: { id: string }) => r.id)
  assert.ok(ids.includes(mine.id))
  assert.ok(ids.includes(working.id))
})

test('GET /v1/users/:id/escrows: role=creator filters to escrows the caller created', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const other = await createUser(app)
  const mine = await createEscrow(app, { creator_id: me.row.id })
  const working = await createEscrow(app, { creator_id: other.row.id, counterparty_id: me.row.id, status: 'accepted' })

  const res = await app.inject({
    method: 'GET', url: `/v1/users/${me.row.id}/escrows?role=creator`, headers: authHeader(me.token),
  })
  assert.strictEqual(res.statusCode, 200)
  const ids = res.json().data.map((r: { id: string }) => r.id)
  assert.ok(ids.includes(mine.id))
  assert.ok(!ids.includes(working.id), 'counterparty escrow excluded under role=creator')
})

test('GET /v1/users/:id/escrows: kind=exchange filters out gigs', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const gig = await createEscrow(app, { creator_id: me.row.id, kind: 'gig' })
  const res = await app.inject({
    method: 'GET', url: `/v1/users/${me.row.id}/escrows?kind=exchange`, headers: authHeader(me.token),
  })
  assert.strictEqual(res.statusCode, 200)
  const ids = res.json().data.map((r: { id: string }) => r.id)
  assert.ok(!ids.includes(gig.id))
})
