/**
 * #86 — admin email-OTP login:
 *   POST /v1/auth/admin/send-email-otp   (200 unconditionally — no oracle)
 *   POST /v1/auth/admin/verify-email-otp (uniform 401; JWT {id, role} 12h)
 *
 * Codes are captured through an injected fake sender at the lib layer
 * (sendAdminLoginOtp); HTTP send is asserted via its DB side effects.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { email_otps, users } from '@tenda/shared/db/schema/identity'
import { grantAdminEmail } from '../../src/lib/admin-auth'
import { issueAdminCode as issueCode } from '../helpers/admin-auth'
import { TEST_DB_CONFIGURED, useTestApp, createUser, type TestUser } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

async function makeAdmin(app: FastifyInstance, email: string, role: 'dispute_admin' | 'super_admin' = 'super_admin'): Promise<TestUser> {
  const admin = await createUser(app, { role })
  await grantAdminEmail(app.db, { user_id: admin.row.id, email, added_by: null })
  return admin
}

test('send: 200 + identical body for admin, unknown email, and demoted registry row', { skip }, async () => {
  const app = getApp()
  await makeAdmin(app, 'real@tenda.app')
  // Registry row whose role was later demoted — must look identical outside.
  const demoted = await makeAdmin(app, 'demoted@tenda.app')
  await app.db.update(users).set({ role: 'user' }).where(eq(users.id, demoted.row.id))

  const bodies: string[] = []
  for (const email of ['real@tenda.app', 'ghost@tenda.app', 'demoted@tenda.app']) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/send-email-otp',
      payload: { email },
    })
    assert.strictEqual(res.statusCode, 200)
    bodies.push(res.body)
  }
  assert.strictEqual(new Set(bodies).size, 1, 'all send responses must be identical')

  // Only the real admin got a code row.
  const rows = await app.db.select({ email: email_otps.email }).from(email_otps)
  assert.deepStrictEqual(
    rows.map((r) => r.email),
    ['real@tenda.app'],
  )
})

test('verify: correct code → JWT {id, role} with the 12h admin lifetime', { skip }, async () => {
  const app = getApp()
  const admin = await makeAdmin(app, 'ops@tenda.app')
  const code = await issueCode(app, 'ops@tenda.app')

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/verify-email-otp',
    payload: { email: 'OPS@tenda.app', code }, // case-insensitive email
  })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.token_ttl, '12h')
  assert.strictEqual(body.user.id, admin.row.id)
  assert.strictEqual(body.user.role, 'super_admin')

  const claims = app.jwt.verify<{ id: string; role: string; iat: number; exp: number }>(body.token)
  assert.strictEqual(claims.id, admin.row.id)
  assert.strictEqual(claims.role, 'super_admin')
  assert.strictEqual(claims.exp - claims.iat, 12 * 3600)

  // One-shot: the consumed code never works again.
  const replay = await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/verify-email-otp',
    payload: { email: 'ops@tenda.app', code },
  })
  assert.strictEqual(replay.statusCode, 401)
})

test('verify: uniform 401 for unknown email, wrong code, demoted and suspended admins', { skip }, async () => {
  const app = getApp()
  const admin = await makeAdmin(app, 'mediator@tenda.app', 'dispute_admin')
  const code = await issueCode(app, 'mediator@tenda.app')
  const attempt = (email: string, c: string) =>
    app.inject({ method: 'POST', url: '/v1/auth/admin/verify-email-otp', payload: { email, code: c } })

  const ghost = await attempt('ghost@tenda.app', code)
  const wrong = await attempt('mediator@tenda.app', '000000')
  assert.strictEqual(ghost.statusCode, 401)
  assert.strictEqual(wrong.statusCode, 401)
  assert.strictEqual(ghost.json().code, 'OTP_INVALID')
  assert.strictEqual(wrong.json().code, 'OTP_INVALID')
  assert.strictEqual(ghost.json().message, wrong.json().message, 'no admin-email oracle')

  // Demotion between send and verify kills the login (re-check at verify).
  await app.db.update(users).set({ role: 'user' }).where(eq(users.id, admin.row.id))
  const demoted = await attempt('mediator@tenda.app', code)
  assert.strictEqual(demoted.statusCode, 401)

  // Suspension too.
  await app.db.update(users).set({ role: 'dispute_admin', status: 'suspended' }).where(eq(users.id, admin.row.id))
  const suspended = await attempt('mediator@tenda.app', code)
  assert.strictEqual(suspended.statusCode, 401)
})

test('verify: 5 wrong attempts burn the code; expired code → OTP_EXPIRED only with the right code', { skip }, async () => {
  const app = getApp()
  await makeAdmin(app, 'burn@tenda.app')
  const code = await issueCode(app, 'burn@tenda.app')
  const attempt = (c: string) =>
    app.inject({ method: 'POST', url: '/v1/auth/admin/verify-email-otp', payload: { email: 'burn@tenda.app', code: c } })

  for (let i = 0; i < 5; i++) assert.strictEqual((await attempt('999999')).statusCode, 401)
  const burned = await attempt(code) // correct code, but attempts exhausted
  assert.strictEqual(burned.statusCode, 401)
  assert.strictEqual(burned.json().code, 'OTP_INVALID')

  // Expired: issue at a time 11 minutes in the past.
  await makeAdmin(app, 'late@tenda.app')
  const past = new Date(Date.now() - 11 * 60_000)
  const lateCode = await issueCode(app, 'late@tenda.app', past)
  const wrongLate = await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/verify-email-otp',
    payload: { email: 'late@tenda.app', code: '000000' },
  })
  assert.strictEqual(wrongLate.json().code, 'OTP_INVALID') // guesser never sees EXPIRED
  const rightLate = await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/verify-email-otp',
    payload: { email: 'late@tenda.app', code: lateCode },
  })
  assert.strictEqual(rightLate.statusCode, 401)
  assert.strictEqual(rightLate.json().code, 'OTP_EXPIRED')
})

test('send: a new code invalidates every prior one; hourly cap skips silently', { skip }, async () => {
  const app = getApp()
  await makeAdmin(app, 'rotate@tenda.app')
  const first = await issueCode(app, 'rotate@tenda.app')
  const second = await issueCode(app, 'rotate@tenda.app')

  const stale = await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/verify-email-otp',
    payload: { email: 'rotate@tenda.app', code: first },
  })
  assert.strictEqual(stale.statusCode, 401)
  const fresh = await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/verify-email-otp',
    payload: { email: 'rotate@tenda.app', code: second },
  })
  assert.strictEqual(fresh.statusCode, 200)

  // 3 sends already landed this hour (2 above + the cap row below) —
  // the 4th is skipped: 200 outside, no new row inside.
  await issueCode(app, 'rotate@tenda.app')
  const before = await app.db.select({ id: email_otps.id }).from(email_otps)
  const capped = await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/send-email-otp',
    payload: { email: 'rotate@tenda.app' },
  })
  assert.strictEqual(capped.statusCode, 200)
  const after = await app.db.select({ id: email_otps.id }).from(email_otps)
  assert.strictEqual(after.length, before.length, 'capped send must not insert')
})

test('validation: missing email/code → 422', { skip }, async () => {
  const app = getApp()
  const noEmail = await app.inject({ method: 'POST', url: '/v1/auth/admin/send-email-otp', payload: {} })
  assert.strictEqual(noEmail.statusCode, 422)
  const noCode = await app.inject({
    method: 'POST',
    url: '/v1/auth/admin/verify-email-otp',
    payload: { email: 'x@tenda.app' },
  })
  assert.strictEqual(noCode.statusCode, 422)
})
