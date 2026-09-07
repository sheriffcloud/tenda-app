/**
 * A malformed `:id` must never reach postgres.
 *
 * Every id column in the schema is `uuid`, which rejects bad input with
 * `invalid input syntax for type uuid` — an exception, so unguarded routes
 * answered 500. That tells a caller the server fell over when in truth their
 * id was not an id: a stale link or a typo reads as an outage.
 *
 * The sweep is deliberately ENUMERATED from the running app rather than from a
 * hand-written list. The defect was routes each independently forgetting the
 * guard, so a fixed list would only ever cover the ones somebody remembered;
 * a route added tomorrow is covered here the day it is registered.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp, authHeader, createUser } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/**
 * Every prefix is now guarded, so the sweep runs against the WHOLE route
 * table rather than an allow-list — a new plugin is covered without anyone
 * remembering to add it here.
 */

/** Fastify prints a tree; recover METHOD + full path for every leaf. */
function routeTable(tree: string): { method: string; url: string }[] {
  const stack: string[] = []
  const out: { method: string; url: string }[] = []
  for (const raw of tree.split('\n')) {
    if (raw.trim() === '') continue
    const m = raw.match(/^([\s│├└─]*)(\S+)\s*(?:\(([^)]*)\))?\s*$/)
    if (m === null) continue
    const depth = Math.floor(m[1].replace(/─/g, ' ').length / 4)
    stack.length = depth
    stack[depth] = m[2]
    if (m[3] === undefined) continue
    const url = stack.slice(0, depth + 1).join('')
    for (const method of m[3].split(',').map((s) => s.trim())) {
      if (method !== 'HEAD') out.push({ method, url })
    }
  }
  return out
}

test('NO route 5xxs on a malformed id — swept from the live route table', { skip }, async () => {
  const app = getApp()
  const caller = await createUser(app, { role: 'super_admin' })
  const routes = routeTable(app.printRoutes({ commonPrefix: false })).filter((r) => r.url.includes(':'))
  // Guards against the sweep silently covering nothing (a printRoutes format
  // change would otherwise turn this whole test green and empty).
  assert.ok(routes.length >= 100, `expected the full param route table, found ${routes.length}`)

  const failures: string[] = []
  for (const { method, url } of routes) {
    const res = await app.inject({
      method: method as 'GET',
      url: url.replace(/:[A-Za-z_]+/g, 'banana'),
      headers: authHeader(caller.token),
      payload: method === 'GET' || method === 'DELETE' ? undefined : {},
    })
    if (res.statusCode >= 500) failures.push(`${res.statusCode} ${method} ${url}`)
  }
  assert.deepStrictEqual(failures, [], `routes still reaching the driver:\n${failures.join('\n')}`)
})

test('the answer is a clean 404 carrying the route’s own not-found copy', { skip }, async () => {
  // "Not a 5xx" alone would pass on a 403 or a 200-with-empty-page, neither of
  // which is the right answer for an id that cannot exist.
  const app = getApp()
  const user = await createUser(app, { role: 'user' })
  const cases: { method: 'GET' | 'POST' | 'DELETE'; url: string; code: string }[] = [
    { method: 'GET', url: '/v1/gigs/banana', code: 'NOT_FOUND' },
    { method: 'GET', url: '/v1/exchange/banana', code: 'NOT_FOUND' },
    { method: 'GET', url: '/v1/users/banana', code: 'USER_NOT_FOUND' },
    { method: 'GET', url: '/v1/users/banana/reviews', code: 'USER_NOT_FOUND' },
    { method: 'GET', url: '/v1/users/banana/standing', code: 'USER_NOT_FOUND' },
    { method: 'GET', url: '/v1/conversations/banana/messages', code: 'NOT_FOUND' },
    { method: 'POST', url: '/v1/conversations/banana/close', code: 'NOT_FOUND' },
    { method: 'DELETE', url: '/v1/bank-accounts/banana', code: 'NOT_FOUND' },
    { method: 'DELETE', url: '/v1/subscriptions/banana', code: 'NOT_FOUND' },
    { method: 'GET', url: '/v1/fiat/intents/banana', code: 'NOT_FOUND' },
    { method: 'POST', url: '/v1/fiat/intents/banana/cancel', code: 'NOT_FOUND' },
  ]
  for (const { method, url, code } of cases) {
    const res = await app.inject({ method, url, headers: authHeader(user.token), payload: method === 'POST' ? {} : undefined })
    assert.strictEqual(res.statusCode, 404, `${method} ${url}`)
    assert.strictEqual(res.json().code, code, `${method} ${url} code`)
  }
})

test('admin routes answer the same way, including the one named :user_id', { skip }, async () => {
  // /v1/admin/standing/:user_id is the reason the guard takes a param name. A
  // guard hard-coded to `id` would sit on that route doing nothing while
  // READING as though it were covered — worse than leaving it unguarded.
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const cases: { method: 'GET' | 'PATCH' | 'DELETE'; url: string; code: string }[] = [
    { method: 'GET', url: '/v1/admin/announcements/banana', code: 'NOT_FOUND' },
    { method: 'PATCH', url: '/v1/admin/announcements/banana', code: 'NOT_FOUND' },
    { method: 'DELETE', url: '/v1/admin/announcements/banana', code: 'NOT_FOUND' },
    { method: 'GET', url: '/v1/admin/escrows/banana', code: 'NOT_FOUND' },
    { method: 'GET', url: '/v1/admin/escrows/banana/dossier', code: 'NOT_FOUND' },
    { method: 'PATCH', url: '/v1/admin/featured/banana', code: 'NOT_FOUND' },
    { method: 'DELETE', url: '/v1/admin/featured/banana', code: 'NOT_FOUND' },
    { method: 'GET', url: '/v1/admin/fiat/intents/banana', code: 'NOT_FOUND' },
    { method: 'GET', url: '/v1/admin/users/banana', code: 'USER_NOT_FOUND' },
    { method: 'GET', url: '/v1/admin/standing/banana', code: 'USER_NOT_FOUND' },
  ]
  for (const { method, url, code } of cases) {
    const res = await app.inject({ method, url, headers: authHeader(admin.token), payload: method === 'PATCH' ? {} : undefined })
    assert.strictEqual(res.statusCode, 404, `${method} ${url}`)
    assert.strictEqual(res.json().code, code, `${method} ${url} code`)
  }
})

test('the guard checks SHAPE, not existence — a text id route is untouched', { skip }, async () => {
  // fiat_providers.id is `text` ('p2p_internal'), not uuid. A uuid guard
  // applied plugin-wide there would 404 a working endpoint, which is why that
  // plugin is guarded per route rather than at the top.
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const res = await app.inject({
    method: 'PATCH',
    url: '/v1/admin/fiat/providers/p2p_internal',
    headers: authHeader(admin.token),
    payload: { is_enabled: true },
  })
  assert.strictEqual(res.statusCode, 200)
})
