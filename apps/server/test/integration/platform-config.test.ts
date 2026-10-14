/**
 * Admin platform-config validation caps. The fee/grace maxima are sourced from
 * ESCROW_LIMITS (guarded == both contracts by check-contract-parity), so the
 * off-chain config can't accept a value the chain would revert. These cases
 * lock the tightened bounds: an over-limit value must 400 BEFORE the DB write
 * (so they hold regardless of whether platform_config is seeded), and the
 * boundary value must pass validation (not a range 400).
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  ESCROW_LIMITS,
  MAX_PENDING_GIGS_CEILING,
  MAX_OPEN_APPLICATIONS_CEILING,
  MIN_APPLICATION_TTL_SECONDS,
  MAX_APPLICATION_TTL_SECONDS,
  PLATFORM_CONFIG_DEFAULTS,
} from '@tenda/shared'
import { platform_config } from '@tenda/shared/db/schema'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
const { maxPlatformFeeBps, maxGracePeriodSeconds, minUnassignWindowSeconds, maxUnassignWindowSeconds } =
  ESCROW_LIMITS

/** The route updates the singleton row, so it must exist. */
async function seedConfig(app: ReturnType<typeof getApp>) {
  await app.db.insert(platform_config).values({ id: 1 }).onConflictDoNothing()
}

/** `object`: the retired fee fields are sent on purpose, to prove they are refused. */
async function patch(app: ReturnType<typeof getApp>, token: string, payload: object) {
  return app.inject({ method: 'PATCH', url: '/v1/admin/platform-config', headers: authHeader(token), payload })
}

test('the fee fields are refused BY NAME, whatever the value: the fee lives on each contract', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  for (const payload of [{ fee_bps: 300 }, { fee_bps: 0 }, { seeker_fee_bps: 50 }, { fee_bps: 300, seeker_fee_bps: 100 }, { fee_bps: maxPlatformFeeBps + 1 }]) {
    const res = await patch(app, admin.token, payload)
    assert.strictEqual(res.statusCode, 400, `${JSON.stringify(payload)} → ${res.statusCode}`)
    assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
    assert.match(res.json().message, /fee:set/)
    assert.match(res.json().message, new RegExp(Object.keys(payload)[0]))
  }
})

test('a refused fee field changes NOTHING, even alongside a valid one', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const before = (await app.db.select().from(platform_config))[0]
  const res = await patch(app, admin.token, { fee_bps: 300, max_pending_gigs: 4 })
  assert.strictEqual(res.statusCode, 400)
  const after = (await app.db.select().from(platform_config))[0]
  assert.deepStrictEqual(after, before, 'the valid half of a refused request must not be applied either')
})

test('rejects grace_period_seconds above the on-chain MAX_GRACE_PERIOD_SECONDS', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  // One second over the 14-day on-chain cap (was previously accepted up to 30d).
  const res = await patch(app, admin.token, { grace_period_seconds: maxGracePeriodSeconds + 1 })
  assert.strictEqual(res.statusCode, 400, `grace=${maxGracePeriodSeconds + 1} → ${res.statusCode}`)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

test('rejects negative / non-integer values', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  for (const payload of [{ grace_period_seconds: -1 }, { max_pending_gigs: 1.5 }]) {
    const res = await patch(app, admin.token, payload)
    assert.strictEqual(res.statusCode, 400, `${JSON.stringify(payload)} → ${res.statusCode}`)
  }
})

test('boundary values pass validation (not a range 400)', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  // At the cap exactly: validation must accept it. The write may 200 (seeded)
  // or 404 (unseeded row) — both prove validation did not reject the value.
  for (const payload of [{ grace_period_seconds: maxGracePeriodSeconds }]) {
    const res = await patch(app, admin.token, payload)
    assert.notStrictEqual(res.statusCode, 400, `${JSON.stringify(payload)} → ${res.statusCode}`)
  }
})

// ---------- max_pending_gigs (Stage 2 tunable) -------------------------------
// The cap's whole premise is that an operator can retune it without a deploy,
// so the field must be reachable through this route — it was not, and nothing
// caught that because the happy path had no test at all.


test('rejects max_pending_gigs of 0 (would lock every worker out)', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await patch(app, admin.token, { max_pending_gigs: 0 })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

test('rejects max_pending_gigs above the ceiling', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await patch(app, admin.token, { max_pending_gigs: MAX_PENDING_GIGS_CEILING + 1 })
  assert.strictEqual(res.statusCode, 400)
})

test('rejects a non-integer max_pending_gigs', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await patch(app, admin.token, { max_pending_gigs: 2.5 })
  assert.strictEqual(res.statusCode, 400)
})

test('accepts max_pending_gigs at both bounds and persists it', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  for (const value of [1, MAX_PENDING_GIGS_CEILING]) {
    const res = await patch(app, admin.token, { max_pending_gigs: value })
    assert.strictEqual(res.statusCode, 200, `max_pending_gigs=${value} → ${res.statusCode}`)
    assert.strictEqual(res.json().max_pending_gigs, value)
  }
})

// ---------- happy path (previously untested) ---------------------------------

test('updates a single field and returns the whole row', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await patch(app, admin.token, { grace_period_seconds: 7_200 })
  assert.strictEqual(res.statusCode, 200)
  const row = res.json()
  assert.strictEqual(row.grace_period_seconds, 7_200)
  // Untouched fields keep their values — the PATCH is partial, not a replace.
  assert.strictEqual(row.seeker_fee_bps, PLATFORM_CONFIG_DEFAULTS.seeker_fee_bps)
})

test('updates several fields in one call', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await patch(app, admin.token, { grace_period_seconds: 1_800, max_pending_gigs: 4 })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().grace_period_seconds, 1_800)
  assert.strictEqual(res.json().max_pending_gigs, 4)
})

test('an empty body is refused and names every editable field', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await patch(app, admin.token, {})
  assert.strictEqual(res.statusCode, 400)
  for (const field of ['grace_period_seconds', 'max_pending_gigs']) {
    assert.match(res.json().message, new RegExp(field))
  }
  for (const retired of ['fee_bps', 'seeker_fee_bps']) {
    assert.doesNotMatch(res.json().message, new RegExp(`\\b${retired}\\b`), `${retired} is no longer editable here`)
  }
})

test('GET returns the seeded row', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await app.inject({
    method: 'GET', url: '/v1/admin/platform-config', headers: authHeader(admin.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().id, 1)
  assert.strictEqual(typeof res.json().max_pending_gigs, 'number')
})

// ---------- unassign_window_seconds (stage 10) -------------------------------
// Stamped onto every escrow AT CREATE and enforced on-chain, so a value the
// contract would revert must be unreachable through this route — otherwise the
// failure surfaces as a mystery revert on a user's create transaction.

test('rejects an unassign window above the on-chain maximum', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await patch(app, admin.token, {
    unassign_window_seconds: maxUnassignWindowSeconds + 1,
  })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

test('rejects a negative unassign window', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await patch(app, admin.token, { unassign_window_seconds: -1 })
  assert.strictEqual(res.statusCode, 400)
})

test('rejects a non-integer unassign window', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await patch(app, admin.token, { unassign_window_seconds: 3_600.5 })
  assert.strictEqual(res.statusCode, 400)
})

test('accepts the unassign window at both bounds and persists it', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  for (const value of [minUnassignWindowSeconds, maxUnassignWindowSeconds]) {
    const res = await patch(app, admin.token, { unassign_window_seconds: value })
    assert.strictEqual(res.statusCode, 200, `unassign_window_seconds=${value} → ${res.statusCode}`)
    assert.strictEqual(res.json().unassign_window_seconds, value)
  }
})

test('a freshly seeded config exposes the documented default', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await app.inject({
    method: 'GET',
    url: '/v1/admin/platform-config',
    headers: authHeader(admin.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(
    res.json().unassign_window_seconds,
    PLATFORM_CONFIG_DEFAULTS.unassign_window_seconds,
  )
})

// ---------- application tunables (stage 10 / stage 4) ------------------------
// Both back a live cap, so a value the column's CHECK would reject must fail
// here first — otherwise the operator sees a raw constraint violation.

test('rejects max_open_applications outside its range', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  for (const value of [0, MAX_OPEN_APPLICATIONS_CEILING + 1, 2.5]) {
    const res = await patch(app, admin.token, { max_open_applications: value })
    assert.strictEqual(res.statusCode, 400, `max_open_applications=${value}`)
  }
})

test('rejects an application TTL outside its range', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  for (const value of [
    MIN_APPLICATION_TTL_SECONDS - 1,
    MAX_APPLICATION_TTL_SECONDS + 1,
    3_600.5,
  ]) {
    const res = await patch(app, admin.token, { application_ttl_seconds: value })
    assert.strictEqual(res.statusCode, 400, `application_ttl_seconds=${value}`)
  }
})

test('accepts both at their bounds and persists them', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })

  for (const value of [1, MAX_OPEN_APPLICATIONS_CEILING]) {
    const res = await patch(app, admin.token, { max_open_applications: value })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.json().max_open_applications, value)
  }
  for (const value of [MIN_APPLICATION_TTL_SECONDS, MAX_APPLICATION_TTL_SECONDS]) {
    const res = await patch(app, admin.token, { application_ttl_seconds: value })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.json().application_ttl_seconds, value)
  }
})

test('a freshly seeded config exposes the documented application defaults', { skip }, async () => {
  const app = getApp()
  await seedConfig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await app.inject({
    method: 'GET',
    url: '/v1/admin/platform-config',
    headers: authHeader(admin.token),
  })
  assert.strictEqual(res.json().max_open_applications, PLATFORM_CONFIG_DEFAULTS.max_open_applications)
  assert.strictEqual(
    res.json().application_ttl_seconds,
    PLATFORM_CONFIG_DEFAULTS.application_ttl_seconds,
  )
})
