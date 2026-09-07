/**
 * Admin STANDING and login-mailer refusals that no test executed (#105 T5a).
 *
 * The other half of the tranche; the user and role guards are in
 * admin-refusals-users.test.ts. Split by subject to stay under the 300-line
 * rule rather than by counting lines — these four refusals and the mailer seam
 * are one story (what an admin may do to somebody's standing, and whether the
 * dashboard can send mail at all), and the user/role guards are another.
 *
 * THREE of the four standing refusals answer 422 VALIDATION_ERROR — the fourth,
 * a user with no standing record, answers 404 NOT_FOUND. For the three that
 * share a status the message is the only thing distinguishing them, and the
 * ORDER of two of those is behaviour no status assertion can see.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { standing_overrides } from '@tenda/shared/db/schema/reputation'
import { resolveAdminEmailSender } from '@server/lib/admin-otp'
import { AppError } from '@server/lib/errors'
import { TEST_DB_CONFIGURED, useTestApp, createAdmin, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/**
 * One member of the override vocabulary, written out because the route keeps
 * `OVERRIDE_ACTIONS` module-private. That is deliberate rather than lazy: this
 * is the WIRE value an admin client sends, so pinning the literal is what
 * catches the list being renamed — importing the route's own constant would
 * assert it against itself. If it is ever exported, prefer the import.
 */
const VALID_ACTION = 'lift_restriction'

// ---------- /v1/admin/standing ---------------------------------------------------

test('admin standing: a user with no standing record is 404', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const fresh = await createUser(app)

  const res = await app.inject({
    method: 'GET', url: `/v1/admin/standing/${fresh.row.id}`, headers: authHeader(a.token),
  })
  assert.strictEqual(res.statusCode, 404)
  assert.match(res.json().message, /no standing record for this user/)
})

test('admin standing: an override action outside the vocabulary is 422', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const target = await createUser(app)

  for (const action of [undefined, '', 'ban', 'LIFT_RESTRICTION', 3]) {
    const res = await app.inject({
      method: 'POST', url: `/v1/admin/standing/${target.row.id}/override`,
      headers: authHeader(a.token), payload: { action, reason: 'because' },
    })
    assert.strictEqual(res.statusCode, 422, String(action))
    assert.match(res.json().message, /action must be one of/)
  }
})

test('admin standing: an override with no reason is 422', { skip }, async () => {
  // An override is a manual change to someone's standing; the reason is the
  // audit trail. It is checked AFTER the action, so a request wrong in both ways
  // reports the action — which is why this case sends a valid one.
  const app = getApp()
  const a = await createAdmin(app)
  const target = await createUser(app)

  for (const reason of [undefined, '', 42, null]) {
    const res = await app.inject({
      method: 'POST', url: `/v1/admin/standing/${target.row.id}/override`,
      headers: authHeader(a.token), payload: { action: VALID_ACTION, reason },
    })
    assert.strictEqual(res.statusCode, 422, String(reason))
    assert.match(res.json().message, /reason is required/)
  }
})

test('admin standing: the action check runs BEFORE the reason check', { skip }, async () => {
  // Both answer 422 VALIDATION_ERROR and differ only in message, so ordering is
  // invisible to a status assertion.
  const app = getApp()
  const a = await createAdmin(app)
  const target = await createUser(app)

  const res = await app.inject({
    method: 'POST', url: `/v1/admin/standing/${target.row.id}/override`,
    headers: authHeader(a.token), payload: { action: 'nonsense' },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /action must be one of/)
})

test('admin standing: a valid override APPLIES and is recorded (the control)', { skip }, async () => {
  // The control the four refusals above need, and it was missing until the
  // coverage walk showed the override route's entire success body — the action
  // switch, the store call and the standing_overrides insert — executed by
  // nothing. Without it, a route that refused every override would satisfy all
  // four cases.
  //
  // It also pins the AUDIT ROW, which is the point of the reason guard two cases
  // up: an override that applied but recorded nothing would look identical from
  // the response alone.
  const app = getApp()
  const a = await createAdmin(app)
  const target = await createUser(app)

  const res = await app.inject({
    method: 'POST', url: `/v1/admin/standing/${target.row.id}/override`,
    headers: authHeader(a.token), payload: { action: VALID_ACTION, reason: 'cleared on appeal' },
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  assert.strictEqual(res.json().applied, VALID_ACTION)

  const rows = await app.db
    .select()
    .from(standing_overrides)
    .where(eq(standing_overrides.user_id, target.row.id))
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].action, VALID_ACTION)
  assert.strictEqual(rows[0].reason, 'cleared on appeal')
  assert.strictEqual(rows[0].applied_by, a.row.id)
})

// ---------- the admin login email sender, at its seam -----------------------------

test('admin OTP: an unconfigured email sender is 503 in production', { skip }, async () => {
  // `resolveAdminEmailSender` picks Resend when configured and falls back to a
  // console sender OUTSIDE production. In production with neither key set there
  // is no fallback: admin login mail cannot be sent, and it says so rather than
  // pretending to deliver. Tested here because the function takes its config as
  // an argument — no app boot, no env for the two keys.
  //
  // NODE_ENV is the one thing it reads from the environment. Every assertion
  // below therefore SETS it rather than inheriting it, and the `finally`
  // restores whatever the runner had — so the case measures the function, not
  // the machine it runs on.
  const log = { warn: () => {} }
  const before = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    assert.throws(
      () => resolveAdminEmailSender({ RESEND_API_KEY: null, EMAIL_FROM: null }, log),
      (err: AppError) => err.statusCode === 503 &&
        /admin login email is not configured/.test(err.message),
    )

    // Configured in production → a real sender, so the 503 is the missing
    // configuration and not production being refused outright.
    assert.ok(resolveAdminEmailSender({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.c' }, log))
    // Outside production the console fallback keeps local admin login working.
    // NODE_ENV is SET here rather than left to whatever the runner happens to
    // have: read ambiently, this assertion would throw for anyone running the
    // suite with NODE_ENV=production, and the test would be reporting the
    // environment rather than the function.
    process.env.NODE_ENV = 'test'
    assert.ok(resolveAdminEmailSender({ RESEND_API_KEY: null, EMAIL_FROM: null }, log))
  } finally {
    process.env.NODE_ENV = before
  }
})
