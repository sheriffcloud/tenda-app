/**
 * Admin fiat-intent refusals that no test executed (#105 T5c).
 *
 * routes/v1/admin/fiat.ts was 95 of 191 lines unexecuted: the list, the detail
 * read and BOTH override endpoints — force-settle and refund — had never run.
 * These are the endpoints an operator reaches for when a provider has moved
 * money and the intent did not follow, so "never executed by any test" is a
 * strong statement about the least reversible admin surface there is.
 *
 * THE 409s ARE THE POINT. Both overrides call `store.transition(id, FROM[], to)`
 * with an explicit set of source statuses, and answer 409 when the row is not in
 * one of them. That guard is what stops an operator force-settling an intent
 * that already settled — which would emit a SECOND settled event, and the event
 * is what credits the user. A test that only proves the happy path would leave
 * that unguarded.
 *
 * Every override also requires a reason, because the intent row IS the audit
 * trail: the reason and the acting admin are written into metadata, and the
 * control cases below assert that rather than just the status code.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { fiat_intents } from '@tenda/shared/db/schema/fiat'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createAdmin,
  createUser,
  authHeader,
} from '../helpers/test-app'
import { seedFiatIntent as seedIntent } from '../helpers/fiat-intents'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const BASE = '/v1/admin/fiat/intents'
/** Well-formed but belonging to nothing; the route's uuidParamGuard handles the rest. */
const ABSENT = '00000000-0000-0000-0000-000000000000'

// ---------- the reason guard, shared by both overrides ---------------------------

test('fiat override: a missing or oversized reason is 422, on BOTH overrides', { skip }, async () => {
  // `requireReason` is one helper, but it is CALLED separately by force-settle
  // and by refund, and each call is its own line that can be deleted on its own.
  // Testing the helper through one endpoint only would leave the other's call
  // unguarded — every other refund case in this file sends a valid reason, so
  // nothing would have noticed. Both endpoints therefore run the same table.
  //
  // 1000 chars is the ceiling; 1001 is the interesting value, because a bound
  // that refused a LEGAL reason would be invisible to the empty cases.
  const app = getApp()
  const a = await createAdmin(app)
  const u = await createUser(app)

  for (const action of ['force-settle', 'refund'] as const) {
    const id = await seedIntent(app, u.row.id, 'quoted')
    for (const reason of [undefined, '', '   ', 42, null, 'x'.repeat(1001)]) {
      const res = await app.inject({
        method: 'POST', url: `${BASE}/${id}/${action}`, headers: authHeader(a.token), payload: { reason },
      })
      assert.strictEqual(res.statusCode, 422, `${action}: ${String(reason).slice(0, 20)}`)
      assert.match(res.json().message, /reason is required/, action)
    }

    // Exactly at the ceiling is accepted, which is what makes the 1001 case a
    // bound rather than a blanket refusal.
    const atBound = await app.inject({
      method: 'POST', url: `${BASE}/${id}/${action}`,
      headers: authHeader(a.token), payload: { reason: 'x'.repeat(1000) },
    })
    assert.strictEqual(atBound.statusCode, 200, `${action}: ${atBound.body}`)
  }
})

// ---------- the list filter --------------------------------------------------------

test('fiat intents: an unknown status filter is 422, not an empty list', { skip }, async () => {
  // The filter is a comma-separated list checked against the enum. A junk value
  // must be refused rather than silently matching nothing, or an operator
  // filtering by a typo reads "no such intents" as fact.
  const app = getApp()
  const a = await createAdmin(app)

  for (const status of ['nonsense', 'quoted,nonsense', 'QUOTED', '']) {
    const res = await app.inject({
      method: 'GET', url: `${BASE}?status=${status}`, headers: authHeader(a.token),
    })
    assert.strictEqual(res.statusCode, 422, status)
    assert.match(res.json().message, /unknown status filter/)
  }

  // A real status filters rather than refusing, so the 422 is the vocabulary.
  const u = await createUser(app)
  await seedIntent(app, u.row.id, 'quoted')
  const ok = await app.inject({
    method: 'GET', url: `${BASE}?status=quoted`, headers: authHeader(a.token),
  })
  assert.strictEqual(ok.statusCode, 200, ok.body)
  assert.ok(ok.json().intents.length >= 1)

  // ...and a two-value filter is accepted, which is the branch the comma-split
  // exists for.
  const both = await app.inject({
    method: 'GET', url: `${BASE}?status=quoted,settled`, headers: authHeader(a.token),
  })
  assert.strictEqual(both.statusCode, 200, both.body)
})

// ---------- detail ------------------------------------------------------------------

test('fiat intents: an absent id is 404, and a real one reads back', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const u = await createUser(app)
  const id = await seedIntent(app, u.row.id, 'quoted')

  const found = await app.inject({ method: 'GET', url: `${BASE}/${id}`, headers: authHeader(a.token) })
  assert.strictEqual(found.statusCode, 200, found.body)
  assert.strictEqual(found.json().intent.id, id)

  const absent = await app.inject({ method: 'GET', url: `${BASE}/${ABSENT}`, headers: authHeader(a.token) })
  assert.strictEqual(absent.statusCode, 404)
  assert.match(absent.json().message, /intent not found/)
})

// ---------- force-settle -------------------------------------------------------------

test('fiat force-settle: settles a live intent and records WHO and WHY', { skip }, async () => {
  // The control. It asserts the audit metadata rather than the status alone,
  // because an override that applied without recording the admin and the reason
  // would be indistinguishable from the response.
  const app = getApp()
  const a = await createAdmin(app)
  const u = await createUser(app)
  const id = await seedIntent(app, u.row.id, 'quoted')

  const res = await app.inject({
    method: 'POST', url: `${BASE}/${id}/force-settle`,
    headers: authHeader(a.token), payload: { reason: 'provider confirmed by phone' },
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  assert.strictEqual(res.json().intent.status, 'settled')

  const [row] = await app.db.select().from(fiat_intents).where(eq(fiat_intents.id, id))
  assert.strictEqual(row.status, 'settled')
  const meta = row.metadata as { admin_override?: { action?: string; by?: string; reason?: string } }
  assert.strictEqual(meta.admin_override?.action, 'force_settle')
  assert.strictEqual(meta.admin_override?.by, a.row.id)
  assert.strictEqual(meta.admin_override?.reason, 'provider confirmed by phone')
})

test('fiat force-settle: an already-settled intent is 409, naming its status', { skip }, async () => {
  // The guard that stops a second settled event — the event is what credits the
  // user, so a repeat is not merely redundant.
  const app = getApp()
  const a = await createAdmin(app)
  const u = await createUser(app)
  const id = await seedIntent(app, u.row.id, 'settled')

  const res = await app.inject({
    method: 'POST', url: `${BASE}/${id}/force-settle`,
    headers: authHeader(a.token), payload: { reason: 'double click' },
  })
  assert.strictEqual(res.statusCode, 409, res.body)
  assert.match(res.json().message, /intent is settled/)
})

test('fiat force-settle: an absent id is 404', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const res = await app.inject({
    method: 'POST', url: `${BASE}/${ABSENT}/force-settle`,
    headers: authHeader(a.token), payload: { reason: 'nothing to settle' },
  })
  assert.strictEqual(res.statusCode, 404)
  assert.match(res.json().message, /intent not found/)
})

// ---------- refund --------------------------------------------------------------------

test('fiat refund: marks a live intent failed and records the override', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const u = await createUser(app)
  const id = await seedIntent(app, u.row.id, 'quoted')

  const res = await app.inject({
    method: 'POST', url: `${BASE}/${id}/refund`,
    headers: authHeader(a.token), payload: { reason: 'user cancelled at the bank' },
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  assert.strictEqual(res.json().intent.status, 'failed')

  const [row] = await app.db.select().from(fiat_intents).where(eq(fiat_intents.id, id))
  const meta = row.metadata as { admin_override?: { action?: string; reason?: string } }
  assert.strictEqual(meta.admin_override?.action, 'refund')
  assert.strictEqual(meta.admin_override?.reason, 'user cancelled at the bank')
})

test('fiat refund: an intent past a refundable state is 409, and an absent id 404', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const u = await createUser(app)
  const id = await seedIntent(app, u.row.id, 'failed')

  const conflict = await app.inject({
    method: 'POST', url: `${BASE}/${id}/refund`,
    headers: authHeader(a.token), payload: { reason: 'already failed' },
  })
  assert.strictEqual(conflict.statusCode, 409, conflict.body)
  assert.match(conflict.json().message, /intent is failed/)

  const absent = await app.inject({
    method: 'POST', url: `${BASE}/${ABSENT}/refund`,
    headers: authHeader(a.token), payload: { reason: 'nothing to refund' },
  })
  assert.strictEqual(absent.statusCode, 404)
  assert.match(absent.json().message, /intent not found/)
})
