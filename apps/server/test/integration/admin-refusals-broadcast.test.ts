/**
 * Featured-placement and push-broadcast refusals that no test executed (#105 T5b).
 *
 * Unlike the announcements half of this tranche, both routes here already have
 * their success paths covered — MEASURED from lcov, where the only unexecuted
 * lines in featured.ts and push.ts are these six throws. So these are refusals
 * only, and each names its own field.
 *
 * PUSH IS RATE LIMITED to 10 requests an hour, which is a real constraint on
 * this file rather than a note. The broadcast case below makes SEVEN requests —
 * three to spare — and that headroom is the budget for anyone adding a case
 * here. A request that 429s would still be "not 200", so an over-budget case
 * would keep passing while testing the rate limiter instead of the guard.
 *
 * The featured window guards are two halves of one idea and are easy to
 * conflate: `starts_at and ends_at are required ISO timestamps` fires when
 * either is not a string at all, `starts_at/ends_at must be ISO timestamps`
 * when both are strings that Date cannot parse. Only the message separates them.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createAdmin,
  authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const FEATURED = '/v1/admin/featured'
const BROADCAST = '/v1/admin/push/broadcast'

/**
 * A placement window the route would accept, so each case varies exactly one
 * field. Named `validWindow` rather than `window` on purpose — the bare name
 * shadows the global of the same name, which nothing here needs but which makes
 * the helper read like an ambient rather than a fixture.
 */
function validWindow(): { starts_at: string; ends_at: string } {
  const starts = new Date('2026-09-01T00:00:00.000Z')
  const ends = new Date('2026-09-08T00:00:00.000Z')
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() }
}

// ---------- POST /v1/admin/featured ------------------------------------------------

test('featured: escrow_id is required, and is checked FIRST', { skip }, async () => {
  // Ordering matters here because the window guards answer the same 400: a body
  // missing everything must report escrow_id, since that check sits above
  // parseWindow in the handler.
  const app = getApp()
  const a = await createAdmin(app)

  for (const escrow_id of [undefined, '', 42, null]) {
    const res = await app.inject({
      method: 'POST', url: FEATURED, headers: authHeader(a.token),
      payload: { escrow_id, ...validWindow() },
    })
    assert.strictEqual(res.statusCode, 400, String(escrow_id))
    assert.match(res.json().message, /^escrow_id is required$/)
  }

  const nothing = await app.inject({
    method: 'POST', url: FEATURED, headers: authHeader(a.token), payload: {},
  })
  assert.strictEqual(nothing.statusCode, 400)
  assert.match(nothing.json().message, /^escrow_id is required$/, 'escrow_id is reported before the window')
})

test('featured: a window that is not two strings is 400', { skip }, async () => {
  // The `typeof !== 'string'` half. A missing end date is the realistic one — a
  // dashboard form that only filled in the start.
  const app = getApp()
  const a = await createAdmin(app)
  const w = validWindow()

  const cases: Array<Record<string, unknown>> = [
    { starts_at: w.starts_at },
    { ends_at: w.ends_at },
    {},
    { starts_at: w.starts_at, ends_at: 1757289600000 },
    { starts_at: null, ends_at: w.ends_at },
  ]
  for (const over of cases) {
    const res = await app.inject({
      method: 'POST', url: FEATURED, headers: authHeader(a.token),
      payload: { escrow_id: 'any-non-empty-string', ...over },
    })
    assert.strictEqual(res.statusCode, 400, JSON.stringify(over))
    assert.match(res.json().message, /starts_at and ends_at are required ISO timestamps/)
  }
})

test('featured: two strings Date cannot parse are 400, with the OTHER message', { skip }, async () => {
  // The second half. These ARE strings, so they clear the guard above and fail
  // on `Number.isNaN(getTime())` — the distinction the two messages carry, and
  // the only way to tell which guard ran.
  const app = getApp()
  const a = await createAdmin(app)
  const w = validWindow()

  const cases: Array<[unknown, unknown]> = [
    ['nonsense', w.ends_at],
    [w.starts_at, 'nonsense'],
    ['2026-13-45T00:00:00Z', '2026-14-01T00:00:00Z'],
  ]
  for (const [starts_at, ends_at] of cases) {
    const res = await app.inject({
      method: 'POST', url: FEATURED, headers: authHeader(a.token),
      payload: { escrow_id: 'any-non-empty-string', starts_at, ends_at },
    })
    assert.strictEqual(res.statusCode, 400, `${String(starts_at)} / ${String(ends_at)}`)
    assert.match(res.json().message, /starts_at\/ends_at must be ISO timestamps/)
  }
})

// ---------- POST /v1/admin/push/broadcast -------------------------------------------

test('push broadcast: title, body and target are each required BY NAME', { skip }, async () => {
  // Three guards, one 400, three messages — and the order is title → body →
  // target, which the last case pins by sending a body wrong in all three ways.
  //
  // Seven requests total, inside the route's 10/hour limit (see the file header).
  const app = getApp()
  const a = await createAdmin(app)
  const send = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: BROADCAST, headers: authHeader(a.token), payload })

  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ title: '', body: 'b', target: 'all' }, /^title is required$/],
    [{ title: '   ', body: 'b', target: 'all' }, /^title is required$/],
    [{ title: 't', body: '', target: 'all' }, /^body is required$/],
    [{ title: 't', body: '   ', target: 'all' }, /^body is required$/],
    [{ title: 't', body: 'b', target: '' }, /^target is required$/],
    [{ title: 't', body: 'b' }, /^target is required$/],
    [{}, /^title is required$/],
  ]
  for (const [payload, message] of cases) {
    const res = await send(payload)
    assert.strictEqual(res.statusCode, 400, JSON.stringify(payload))
    assert.match(res.json().message, message, JSON.stringify(payload))
  }
})
