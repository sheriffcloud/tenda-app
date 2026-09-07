/**
 * #88 — admin auth cross-cutting matrix. The per-route behaviours live in
 * admin-grant-email / admin-email-otp / admin-login-email suites; this
 * file proves the FLOWS compose:
 *   - bootstrap (ops grant) → OTP login → JWT passes a real /v1/admin route
 *   - provisioned dispute_admin token is permission-scoped, not all-access
 *   - suspension / email rotation / revocation each kill the login E2E
 *
 * Deliberately NOT tested: an existing JWT surviving up to 60 s after
 * demotion — that's the documented auth statusCache window; the security
 * property (no NEW login after demotion) is pinned in admin-email-otp.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { email_otps, users } from '@tenda/shared/db/schema/identity'
import type { FastifyInstance } from 'fastify'
import { grantAdminEmail } from '../../src/lib/admin-auth'
import { issueAdminCode } from '../helpers/admin-auth'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

async function loginWith(app: FastifyInstance, email: string, code: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/admin/verify-email-otp',
    payload: { email, code },
  })
}

test('bootstrap E2E: ops grant → OTP login → JWT passes a real /v1/admin route', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  await grantAdminEmail(app.db, { user_id: root.row.id, email: 'boot@tenda.app', added_by: null })

  const code = await issueAdminCode(app, 'boot@tenda.app')
  const login = await loginWith(app, 'boot@tenda.app', code)
  assert.strictEqual(login.statusCode, 200)
  const { token } = login.json()

  const adminList = await app.inject({
    method: 'GET',
    url: '/v1/admin/users',
    headers: authHeader(token),
  })
  assert.strictEqual(adminList.statusCode, 200)
  assert.ok(Array.isArray(adminList.json().data))
})

test('scope E2E: dispute_admin email-JWT reaches disputes but not user management', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  const mediator = await createUser(app, { role: 'dispute_admin' })
  const grant = await app.inject({
    method: 'PUT',
    url: `/v1/admin/users/${mediator.row.id}/login-email`,
    headers: authHeader(root.token),
    payload: { email: 'scoped@tenda.app' },
  })
  assert.strictEqual(grant.statusCode, 200)

  const code = await issueAdminCode(app, 'scoped@tenda.app')
  const login = await loginWith(app, 'scoped@tenda.app', code)
  assert.strictEqual(login.statusCode, 200)
  const { token } = login.json()

  const disputes = await app.inject({
    method: 'GET',
    url: '/v1/admin/disputes',
    headers: authHeader(token),
  })
  assert.strictEqual(disputes.statusCode, 200)

  const userMgmt = await app.inject({
    method: 'GET',
    url: '/v1/admin/users',
    headers: authHeader(token),
  })
  assert.strictEqual(userMgmt.statusCode, 403)
})

test('suspension E2E: send issues nothing and a pre-issued code stops verifying', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  await grantAdminEmail(app.db, { user_id: admin.row.id, email: 'frozen@tenda.app', added_by: null })
  const code = await issueAdminCode(app, 'frozen@tenda.app')

  await app.db.update(users).set({ status: 'suspended' }).where(eq(users.id, admin.row.id))

  const before = await app.db.select({ id: email_otps.id }).from(email_otps)
  const send = await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/send-email-otp',
    payload: { email: 'frozen@tenda.app' },
  })
  assert.strictEqual(send.statusCode, 200) // uniform outside…
  const after = await app.db.select({ id: email_otps.id }).from(email_otps)
  assert.strictEqual(after.length, before.length, '…but no code issued')

  assert.strictEqual((await loginWith(app, 'frozen@tenda.app', code)).statusCode, 401)
})

test('rotation E2E: old email is dead immediately; new email logs in', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  await grantAdminEmail(app.db, { user_id: root.row.id, email: 'old@tenda.app', added_by: null })
  const oldCode = await issueAdminCode(app, 'old@tenda.app')

  await grantAdminEmail(app.db, { user_id: root.row.id, email: 'new@tenda.app', added_by: null })

  // Old email: no registry mapping → pre-issued code refuses, send no-ops.
  assert.strictEqual((await loginWith(app, 'old@tenda.app', oldCode)).statusCode, 401)
  const before = await app.db.select({ id: email_otps.id }).from(email_otps)
  await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/send-email-otp',
    payload: { email: 'old@tenda.app' },
  })
  const after = await app.db.select({ id: email_otps.id }).from(email_otps)
  assert.strictEqual(after.length, before.length)

  const newCode = await issueAdminCode(app, 'new@tenda.app')
  assert.strictEqual((await loginWith(app, 'new@tenda.app', newCode)).statusCode, 200)
})

test('revocation E2E: DELETE login-email kills pending codes and future sends', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  const target = await createUser(app, { role: 'dispute_admin' })
  await app.inject({
    method: 'PUT',
    url: `/v1/admin/users/${target.row.id}/login-email`,
    headers: authHeader(root.token),
    payload: { email: 'cut@tenda.app' },
  })
  const code = await issueAdminCode(app, 'cut@tenda.app')

  const revoke = await app.inject({
    method: 'DELETE',
    url: `/v1/admin/users/${target.row.id}/login-email`,
    headers: authHeader(root.token),
  })
  assert.strictEqual(revoke.statusCode, 200)

  assert.strictEqual((await loginWith(app, 'cut@tenda.app', code)).statusCode, 401)
  const before = await app.db.select({ id: email_otps.id }).from(email_otps)
  await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/send-email-otp',
    payload: { email: 'cut@tenda.app' },
  })
  const after = await app.db.select({ id: email_otps.id }).from(email_otps)
  assert.strictEqual(after.length, before.length, 'revoked email must not receive codes')
})
