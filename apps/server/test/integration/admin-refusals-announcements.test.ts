/**
 * Admin announcement refusals that no test executed (#105 T5b).
 *
 * THIS ROUTE FILE WAS THE WORST IN THE SWEEP: 80 of its 206 lines were
 * unexecuted, and three of its five handlers — GET /:id, PATCH /:id and
 * DELETE /:id — had never been driven by any test at all, successfully or
 * otherwise. Only the list and create paths were exercised.
 *
 * That is why this file is not purely refusals. Adding eleven refusal cases to
 * handlers nothing had ever run would have produced eleven assertions that a
 * route returning 404 to everybody would satisfy. Each handler therefore gets
 * its control, and the PATCH control also pins `published_at`, which is set on
 * the first activation and never again — behaviour with no test and a real
 * consequence (an announcement that re-dates itself on every edit).
 *
 * Every refusal here answers 400 or 404 with a distinct message, so the message
 * is what says which guard fired.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { announcements } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createAdmin,
  authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const URL = '/v1/admin/announcements'

/**
 * Ids that match no announcement. The first is well-formed; the rest are not
 * uuids at all, and they are here because I assumed they would NOT be safe.
 *
 * THEY ARE SAFE, AND BY DESIGN — corrected at #111, because the note that stood
 * here said the opposite. It claimed these routes carry no `uuidParamGuard` and
 * survive a malformed id by luck of a different query shape. Both halves were
 * wrong, and the reason I got it wrong is worth keeping: the guard is a
 * PLUGIN-LEVEL `fastify.addHook` at the top of announcements.ts, not a
 * per-route preHandler, so reading the handlers finds nothing.
 *
 * MEASURED for the correction: all three drizzle shapes — `select().where(eq)`,
 * the same on another table, and `query.<table>.findFirst` — throw on
 * 'not-a-uuid'. There is no safe query shape. What makes these routes safe is
 * the guard, which commit c6dcd71 added across the :id routes; that today's
 * whole route table is safe is asserted by malformed-id.test.ts, which sweeps
 * it live rather than trusting any list.
 *
 * These ids stay pinned anyway. This suite asserts the 404 carries the
 * announcements copy, which the sweep (asserting only "never 5xx") does not.
 */
const ABSENT_IDS = ['00000000-0000-0000-0000-000000000000', 'not-a-uuid', '123'] as const

/** Create one announcement and return its id; the POST path is already covered. */
async function create(
  app: ReturnType<typeof getApp>,
  token: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: URL, headers: authHeader(token),
    payload: { title: 'Scheduled maintenance', body: 'Back at 09:00.', ...over },
  })
  // 200, not 201 — measured. The route returns the created row on the same
  // status as a read; asserting 201 from habit is what caught it.
  assert.strictEqual(res.statusCode, 200, res.body)
  // `json<T>()` rather than an `unknown` + narrow, or a cast: inject's json is
  // generic, so the shape this helper depends on is stated once and checked by
  // the compiler. The runtime assert stays because the compiler is only
  // describing what the route is SUPPOSED to return.
  const { id } = res.json<{ id: string }>()
  assert.strictEqual(typeof id, 'string', res.body)
  return id
}

// ---------- POST: the four body guards -------------------------------------------

test('announcements POST: title and body are required, each by name', { skip }, async () => {
  // One helper shape, two fields — so the message is the only thing proving the
  // right one was rejected.
  const app = getApp()
  const a = await createAdmin(app)

  for (const title of [undefined, '', '   ']) {
    const res = await app.inject({
      method: 'POST', url: URL, headers: authHeader(a.token), payload: { title, body: 'b' },
    })
    assert.strictEqual(res.statusCode, 400, String(title))
    assert.match(res.json().message, /^title is required$/)
  }

  for (const body of [undefined, '', '   ']) {
    const res = await app.inject({
      method: 'POST', url: URL, headers: authHeader(a.token), payload: { title: 't', body },
    })
    assert.strictEqual(res.statusCode, 400, String(body))
    assert.match(res.json().message, /^body is required$/)
  }
})

test('announcements POST: priority must be an integer in 0..10', { skip }, async () => {
  // Priority orders the in-app banner stack. A float or an out-of-range value
  // would be stored and then sorted against integers.
  const app = getApp()
  const a = await createAdmin(app)

  for (const priority of [-1, 11, 1.5, Number.NaN, '3', null]) {
    const res = await app.inject({
      method: 'POST', url: URL, headers: authHeader(a.token),
      payload: { title: 't', body: 'b', priority },
    })
    assert.strictEqual(res.statusCode, 400, String(priority))
    assert.match(res.json().message, /priority must be an integer between 0 and 10/)
  }

  // Both bounds are inclusive — an off-by-one here would refuse a legal banner.
  for (const priority of [0, 10]) {
    const ok = await app.inject({
      method: 'POST', url: URL, headers: authHeader(a.token),
      payload: { title: 't', body: 'b', priority },
    })
    assert.strictEqual(ok.statusCode, 200, `${priority}: ${ok.body}`)
  }
})

test('announcements POST: an unparseable expires_at is 400', { skip }, async () => {
  // `new Date('nonsense')` is an Invalid Date, not a throw — without this guard
  // the row would take a NaN timestamp and the banner would never expire.
  const app = getApp()
  const a = await createAdmin(app)

  for (const expires_at of ['nonsense', '2026-13-45', 'tomorrow']) {
    const res = await app.inject({
      method: 'POST', url: URL, headers: authHeader(a.token),
      payload: { title: 't', body: 'b', expires_at },
    })
    assert.strictEqual(res.statusCode, 400, expires_at)
    assert.match(res.json().message, /expires_at must be a valid ISO date/)
  }
})

// ---------- GET /:id ---------------------------------------------------------------

test('announcements GET /:id: reads one back, and 404s for an absent id', { skip }, async () => {
  // The control comes FIRST here because this handler had never run at all: the
  // 404 below means nothing unless the route can also find something.
  const app = getApp()
  const a = await createAdmin(app)
  const id = await create(app, a.token)

  const found = await app.inject({ method: 'GET', url: `${URL}/${id}`, headers: authHeader(a.token) })
  assert.strictEqual(found.statusCode, 200, found.body)
  assert.strictEqual(found.json().id, id)
  assert.strictEqual(found.json().title, 'Scheduled maintenance')

  for (const missing of ABSENT_IDS) {
    const absent = await app.inject({
      method: 'GET', url: `${URL}/${missing}`, headers: authHeader(a.token),
    })
    assert.strictEqual(absent.statusCode, 404, missing)
    assert.match(absent.json().message, /Announcement not found/, missing)
  }
})

// ---------- PATCH /:id -------------------------------------------------------------

test('announcements PATCH: an explicitly blank title or body is 400', { skip }, async () => {
  // PATCH is partial, so `undefined` means "leave it alone" and only an
  // explicitly empty value is an error. That distinction is the whole guard:
  // `!title` would refuse a perfectly good partial update.
  const app = getApp()
  const a = await createAdmin(app)
  const id = await create(app, a.token)

  for (const [field, message] of [['title', /^title cannot be empty$/], ['body', /^body cannot be empty$/]] as const) {
    for (const value of ['', '   ']) {
      const res = await app.inject({
        method: 'PATCH', url: `${URL}/${id}`, headers: authHeader(a.token), payload: { [field]: value },
      })
      assert.strictEqual(res.statusCode, 400, `${field}=${JSON.stringify(value)}`)
      assert.match(res.json().message, message)
    }
  }
})

test('announcements PATCH: priority and expires_at are validated when present', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const id = await create(app, a.token)

  for (const priority of [-1, 11, 2.5]) {
    const res = await app.inject({
      method: 'PATCH', url: `${URL}/${id}`, headers: authHeader(a.token), payload: { priority },
    })
    assert.strictEqual(res.statusCode, 400, String(priority))
    assert.match(res.json().message, /priority must be an integer between 0 and 10/)
  }

  // The BOUNDS, and they are not decoration: MEASURED, a mutant narrowing this
  // guard to `>= 10` survived the three cases above, because none of them sends
  // exactly 10. The POST case had this loop and the PATCH case did not.
  for (const priority of [0, 10]) {
    const ok = await app.inject({
      method: 'PATCH', url: `${URL}/${id}`, headers: authHeader(a.token), payload: { priority },
    })
    assert.strictEqual(ok.statusCode, 200, `${priority}: ${ok.body}`)
    assert.strictEqual(ok.json().priority, priority)
  }

  const bad = await app.inject({
    method: 'PATCH', url: `${URL}/${id}`, headers: authHeader(a.token), payload: { expires_at: 'nonsense' },
  })
  assert.strictEqual(bad.statusCode, 400)
  assert.match(bad.json().message, /expires_at must be a valid ISO date or null/)

  // null is the documented way to CLEAR an expiry and must not be confused with
  // an invalid date — the guard's `!== null` half exists for exactly this.
  const cleared = await app.inject({
    method: 'PATCH', url: `${URL}/${id}`, headers: authHeader(a.token), payload: { expires_at: null },
  })
  assert.strictEqual(cleared.statusCode, 200, cleared.body)
  assert.strictEqual(cleared.json().expires_at, null)
})

test('announcements PATCH: an absent id is 404, and a real one updates', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)

  for (const missing of ABSENT_IDS) {
    const absent = await app.inject({
      method: 'PATCH', url: `${URL}/${missing}`, headers: authHeader(a.token), payload: { title: 'x' },
    })
    assert.strictEqual(absent.statusCode, 404, missing)
    assert.match(absent.json().message, /Announcement not found/, missing)
  }

  // The control, and it pins PUBLISHED_AT — set on the first activation and
  // never rewritten. Nothing tested this, and an announcement that re-dated
  // itself on every edit would look correct in the response.
  const id = await create(app, a.token, { is_active: false })
  const [before] = await app.db.select().from(announcements).where(eq(announcements.id, id))
  assert.strictEqual(before.published_at, null, 'an inactive announcement is unpublished')

  const activated = await app.inject({
    method: 'PATCH', url: `${URL}/${id}`, headers: authHeader(a.token),
    payload: { is_active: true, title: 'Now live' },
  })
  assert.strictEqual(activated.statusCode, 200, activated.body)
  assert.strictEqual(activated.json().title, 'Now live')
  const [published] = await app.db.select().from(announcements).where(eq(announcements.id, id))
  assert.notStrictEqual(published.published_at, null, 'activation stamps published_at')

  const again = await app.inject({
    method: 'PATCH', url: `${URL}/${id}`, headers: authHeader(a.token),
    payload: { is_active: true, title: 'Edited' },
  })
  assert.strictEqual(again.statusCode, 200, again.body)
  const [reedited] = await app.db.select().from(announcements).where(eq(announcements.id, id))
  assert.deepStrictEqual(reedited.published_at, published.published_at, 'published_at is stamped once')
})

// ---------- DELETE /:id ------------------------------------------------------------

test('announcements DELETE: removes the row, and 404s for an absent id', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const id = await create(app, a.token)

  const gone = await app.inject({ method: 'DELETE', url: `${URL}/${id}`, headers: authHeader(a.token) })
  assert.strictEqual(gone.statusCode, 200, gone.body)
  assert.strictEqual(gone.json().id, id)
  const rows = await app.db.select().from(announcements).where(eq(announcements.id, id))
  assert.strictEqual(rows.length, 0, 'the row is actually deleted')

  // Deleting the SAME id twice is the realistic 404 — a double-click on the
  // dashboard — and it proves the guard reads the delete's own result rather
  // than a prior existence check.
  const twice = await app.inject({ method: 'DELETE', url: `${URL}/${id}`, headers: authHeader(a.token) })
  assert.strictEqual(twice.statusCode, 404)
  assert.match(twice.json().message, /Announcement not found/)
})
