/**
 * #87 — login-email provisioning + demotion revoke:
 *   PUT/DELETE /v1/admin/users/:id/login-email (users.assign_roles gate)
 *   PATCH /v1/admin/users/:id/role — non-admin role revokes the login in
 *   the same transaction; lateral admin moves keep it.
 *
 * Audit assertions are made on the appEvents payloads (the harness does
 * not register the audit plugin; the listener bodies are plain writes).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { admin_users } from '@tenda/shared/db/schema/identity'
import { appEvents, type AppEvents } from '../../src/lib/events'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** Capture the next emission of an event during fn(). */
async function captureEvent<K extends keyof AppEvents>(
  event: K,
  fn: () => Promise<void>,
): Promise<AppEvents[K] | null> {
  let captured: AppEvents[K] | null = null
  const handler = (data: AppEvents[K]) => {
    captured = data
  }
  appEvents.on(event, handler)
  try {
    await fn()
  } finally {
    appEvents.off(event, handler)
  }
  return captured
}

test('PUT login-email: super_admin grants (lowercased, added_by stamped, event emitted); dispute_admin 403', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  const mediator = await createUser(app, { role: 'dispute_admin' })

  const event = await captureEvent('admin.grant_login_email', async () => {
    const granted = await app.inject({
      method: 'PUT',
      url: `/v1/admin/users/${mediator.row.id}/login-email`,
      headers: authHeader(root.token),
      payload: { email: 'Mediator@Tenda.APP' },
    })
    assert.strictEqual(granted.statusCode, 200)
    assert.deepStrictEqual(granted.json(), {
      user_id: mediator.row.id,
      email: 'mediator@tenda.app',
      role: 'dispute_admin',
    })
  })
  assert.deepStrictEqual(event, {
    adminId: root.row.id,
    adminRole: 'super_admin',
    userId: mediator.row.id,
    email: 'mediator@tenda.app',
  })

  const [row] = await app.db
    .select()
    .from(admin_users)
    .where(eq(admin_users.user_id, mediator.row.id))
  assert.strictEqual(row.added_by, root.row.id)

  // dispute_admin lacks users.assign_roles — cannot provision logins.
  const denied = await app.inject({
    method: 'PUT',
    url: `/v1/admin/users/${root.row.id}/login-email`,
    headers: authHeader(mediator.token),
    payload: { email: 'x@tenda.app' },
  })
  assert.strictEqual(denied.statusCode, 403)
})

test('PUT login-email: lib refusals surface as HTTP codes (422 non-admin, 409 in-use, 422 missing)', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  const plain = await createUser(app)
  const other = await createUser(app, { role: 'dispute_admin' })
  const put = (id: string, payload: object) =>
    app.inject({ method: 'PUT', url: `/v1/admin/users/${id}/login-email`, headers: authHeader(root.token), payload })

  assert.strictEqual((await put(plain.row.id, { email: 'x@tenda.app' })).statusCode, 422)
  assert.strictEqual((await put(other.row.id, {})).statusCode, 422)

  await put(root.row.id, { email: 'taken@tenda.app' })
  const conflict = await put(other.row.id, { email: 'taken@tenda.app' })
  assert.strictEqual(conflict.statusCode, 409)
  assert.strictEqual(conflict.json().code, 'EMAIL_IN_USE')
})

test('DELETE login-email: revokes once (event emitted), idempotent + silent after', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  const target = await createUser(app, { role: 'dispute_admin' })
  await app.inject({
    method: 'PUT',
    url: `/v1/admin/users/${target.row.id}/login-email`,
    headers: authHeader(root.token),
    payload: { email: 'gone@tenda.app' },
  })

  const del = () =>
    app.inject({
      method: 'DELETE',
      url: `/v1/admin/users/${target.row.id}/login-email`,
      headers: authHeader(root.token),
    })

  const event = await captureEvent('admin.revoke_login_email', async () => {
    const first = await del()
    assert.strictEqual(first.statusCode, 200)
    assert.deepStrictEqual(first.json(), { user_id: target.row.id, revoked: true })
  })
  assert.strictEqual(event?.userId, target.row.id)

  // Idempotent no-op: revoked=false and NO second event.
  const repeat = await captureEvent('admin.revoke_login_email', async () => {
    const second = await del()
    assert.deepStrictEqual(second.json(), { user_id: target.row.id, revoked: false })
  })
  assert.strictEqual(repeat, null)

  const rows = await app.db.select().from(admin_users).where(eq(admin_users.user_id, target.row.id))
  assert.strictEqual(rows.length, 0)

  // Junk id is pre-validated (review fix) — 422, never a PG uuid-cast 500.
  const junk = await app.inject({
    method: 'DELETE',
    url: '/v1/admin/users/not-a-uuid/login-email',
    headers: authHeader(root.token),
  })
  assert.strictEqual(junk.statusCode, 422)
})

test('demotion to non-admin revokes the login in the role transaction; lateral admin move keeps it', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })
  const demotee = await createUser(app, { role: 'dispute_admin' })
  const lateral = await createUser(app, { role: 'super_admin' })
  const grant = (id: string, email: string) =>
    app.inject({ method: 'PUT', url: `/v1/admin/users/${id}/login-email`, headers: authHeader(root.token), payload: { email } })
  await grant(demotee.row.id, 'demotee@tenda.app')
  await grant(lateral.row.id, 'lateral@tenda.app')

  const event = await captureEvent('admin.change_role', async () => {
    const demote = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${demotee.row.id}/role`,
      headers: authHeader(root.token),
      payload: { role: 'user' },
    })
    assert.strictEqual(demote.statusCode, 200)
  })
  assert.strictEqual(event?.revokedLogin, true)
  const demoteeRows = await app.db.select().from(admin_users).where(eq(admin_users.user_id, demotee.row.id))
  assert.strictEqual(demoteeRows.length, 0, 'demotion must revoke the dashboard login')

  const moveEvent = await captureEvent('admin.change_role', async () => {
    const move = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${lateral.row.id}/role`,
      headers: authHeader(root.token),
      payload: { role: 'dispute_admin' },
    })
    assert.strictEqual(move.statusCode, 200)
  })
  assert.strictEqual(moveEvent?.revokedLogin, false)
  const lateralRows = await app.db.select().from(admin_users).where(eq(admin_users.user_id, lateral.row.id))
  assert.strictEqual(lateralRows.length, 1, 'admin-to-admin move must keep the login')
})
