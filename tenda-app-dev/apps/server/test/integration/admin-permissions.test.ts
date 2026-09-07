/**
 * Permission layer (#76) — HTTP wiring over /v1/admin/*:
 *   - scope gate: any admin role enters, plain users and anonymous don't
 *   - per-route requirePermission: dispute_admin reaches its dispute scope
 *     and nothing else; super_admin reaches everything.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('admin scope: anonymous 401, plain user 403', { skip }, async () => {
  const app = getApp()
  const anon = await app.inject({ method: 'GET', url: '/v1/admin/disputes' })
  assert.strictEqual(anon.statusCode, 401)

  const user = await createUser(app)
  const denied = await app.inject({
    method: 'GET',
    url: '/v1/admin/disputes',
    headers: authHeader(user.token),
  })
  assert.strictEqual(denied.statusCode, 403)
})

test('dispute_admin: disputes + admin escrow reads pass', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'dispute_admin' })
  for (const url of ['/v1/admin/disputes', '/v1/admin/escrows']) {
    const res = await app.inject({ method: 'GET', url, headers: authHeader(admin.token) })
    assert.strictEqual(res.statusCode, 200, `${url} → ${res.statusCode}`)
  }
})

test('dispute_admin: everything outside the dispute scope → 403', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'dispute_admin' })
  const denied = [
    { method: 'GET' as const, url: '/v1/admin/users' },
    { method: 'GET' as const, url: '/v1/admin/reports' },
    { method: 'GET' as const, url: '/v1/admin/finance/fees' },
    { method: 'GET' as const, url: '/v1/admin/metrics' },
    { method: 'GET' as const, url: '/v1/admin/platform-config' },
    { method: 'PATCH' as const, url: '/v1/admin/platform-config', payload: { fee_bps: 100 } },
    { method: 'GET' as const, url: '/v1/admin/announcements' },
    { method: 'POST' as const, url: '/v1/admin/push/broadcast', payload: { title: 't', body: 'b' } },
  ]
  for (const req of denied) {
    const res = await app.inject({ ...req, headers: authHeader(admin.token) })
    assert.strictEqual(res.statusCode, 403, `${req.method} ${req.url} → ${res.statusCode}`)
    assert.strictEqual(res.json().code, 'FORBIDDEN')
  }
})

test('super_admin: read surface passes everywhere', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const reads = [
    '/v1/admin/disputes',
    '/v1/admin/escrows',
    '/v1/admin/users',
    '/v1/admin/reports',
    '/v1/admin/announcements',
  ]
  for (const url of reads) {
    const res = await app.inject({ method: 'GET', url, headers: authHeader(admin.token) })
    assert.strictEqual(res.statusCode, 200, `${url} → ${res.statusCode}`)
  }
})

test('super_admin: mutation guard passes (users.suspend wired)', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const target = await createUser(app)
  const res = await app.inject({
    method: 'PATCH',
    url: `/v1/admin/users/${target.row.id}/status`,
    headers: authHeader(admin.token),
    payload: { status: 'suspended' },
  })
  assert.strictEqual(res.statusCode, 200)

  // and the dispute_admin is refused the same mutation
  const lesser = await createUser(app, { role: 'dispute_admin' })
  const denied = await app.inject({
    method: 'PATCH',
    url: `/v1/admin/users/${target.row.id}/status`,
    headers: authHeader(lesser.token),
    payload: { status: 'active' },
  })
  assert.strictEqual(denied.statusCode, 403)
})
