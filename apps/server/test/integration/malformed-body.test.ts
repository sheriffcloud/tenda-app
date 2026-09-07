/**
 * #98 — ADVERSARIAL: a body-reading POST/PATCH with NO body must return a
 * clean 400, never a 500. Before the requireBody() guard these routes
 * destructured `request.body` (runtime null) and crashed with a TypeError →
 * 500 INTERNAL_ERROR. This test asserts the intended contract and fails on
 * any regression to the old behavior.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED, useTestApp, createUser, createEscrow, authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('body-less POSTs return 400 (not 500) across body-reading routes', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const other = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: other.row.id, status: 'open' })
  const h = authHeader(u.token)

  // Each entry: a route that reads request.body. With no payload at all the
  // guard must short-circuit to 400 before any destructure.
  const cases: Array<{ method: 'POST' | 'PATCH'; url: string }> = [
    { method: 'POST', url: '/v1/reports' },
    { method: 'POST', url: '/v1/conversations' },
    { method: 'POST', url: '/v1/auth/challenge' },
    { method: 'POST', url: '/v1/auth/verify' },
    { method: 'POST', url: '/v1/auth/link-wallet' },
    { method: 'POST', url: '/v1/notifications/device-token' },
    { method: 'PATCH', url: `/v1/users/${u.row.id}` },
    { method: 'POST', url: `/v1/escrows/${escrow.id}/submit` },
    { method: 'POST', url: `/v1/escrows/${escrow.id}/dispute` },
    { method: 'POST', url: `/v1/escrows/${escrow.id}/review` },
  ]

  for (const { method, url } of cases) {
    const res = await app.inject({ method, url, headers: h })
    assert.notStrictEqual(res.statusCode, 500, `${method} ${url} must not 500 on a missing body`)
    assert.strictEqual(res.statusCode, 400, `${method} ${url} should be 400, got ${res.statusCode}`)
    assert.strictEqual(res.json().code, 'VALIDATION_ERROR', `${method} ${url} code`)
  }
})

test('admin body-less mutations also return 400 (not 500)', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const target = await createUser(app)
  const h = authHeader(admin.token)

  const cases: Array<{ method: 'POST' | 'PATCH'; url: string }> = [
    { method: 'POST', url: '/v1/admin/push/broadcast' },
    { method: 'POST', url: '/v1/admin/announcements' },
    { method: 'PATCH', url: '/v1/admin/platform-config' },
    { method: 'PATCH', url: `/v1/admin/users/${target.row.id}/status` },
  ]

  for (const { method, url } of cases) {
    const res = await app.inject({ method, url, headers: h })
    assert.notStrictEqual(res.statusCode, 500, `${method} ${url} must not 500 on a missing body`)
    assert.strictEqual(res.statusCode, 400, `${method} ${url} should be 400, got ${res.statusCode}`)
  }
})
