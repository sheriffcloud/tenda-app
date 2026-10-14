/**
 * CORS plugin: which response headers a browser script may read (#36) and which
 * origins may reach /v1/admin/*.
 *
 * A browser hides every response header that is not CORS-safelisted unless the
 * server lists it in Access-Control-Expose-Headers. The rate-limit headers, the
 * Retry-After after a 429 and the relay receipt on the paid 201 are exactly the
 * ones a client needs and cannot otherwise see. The allow-list itself (which
 * ORIGINS may call) must not move: exposing a header is not widening access.
 *
 * The admin-origin hook is the plugin's other job and had no test anywhere (the
 * integration harness does not register this plugin). The dev allow-all branch
 * (ADMIN_ORIGIN unset) lives in cors-admin-origin-dev.test.ts, because the
 * config is read once per process.
 */
import '../helpers/test-app/env'
import { test } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import corsPlugin from '@server/plugins/cors'

const ALLOWED = 'https://app.tenda.test'
const ADMIN = 'https://admin.tenda.test'
const REJECTED = 'https://evil.example'

// The plugin reads these through getConfig() when it REGISTERS, not when it is
// imported, so setting them here (before any buildApp call) is early enough.
process.env.CORS_ORIGIN = ALLOWED
process.env.ADMIN_ORIGIN = ADMIN

async function buildApp() {
  const app = Fastify()
  await app.register(corsPlugin)
  app.get('/x', async () => ({ ok: true }))
  app.get('/v1/admin/x', async () => ({ ok: true }))
  await app.ready()
  return app
}

const exposed = (value: string | string[] | undefined): string[] =>
  String(value ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)

test('a simple request from an allowed origin exposes the rate-limit, retry-after and receipt headers', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/x', headers: { origin: ALLOWED } })
  assert.strictEqual(res.headers['access-control-allow-origin'], ALLOWED)
  assert.deepStrictEqual(exposed(res.headers['access-control-expose-headers']).sort(), [
    'retry-after',
    'x-payment-response',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
  ])
  await app.close()
})

test('a preflight from an allowed origin is still answered and keeps the same allow-list', async () => {
  const app = await buildApp()
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/x',
    headers: {
      origin: ALLOWED,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type,x-payment',
    },
  })
  assert.strictEqual(res.statusCode, 204)
  assert.strictEqual(res.headers['access-control-allow-origin'], ALLOWED)
  assert.match(String(res.headers['access-control-allow-methods']), /POST/)
  await app.close()
})

test('a disallowed origin is still refused: no allow-origin, so its browser ignores everything else', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/x', headers: { origin: REJECTED } })
  // @fastify/cors lists the exposed headers on every response, but a browser
  // honours them only alongside an allow-origin that matches. THAT is the gate.
  assert.strictEqual(res.headers['access-control-allow-origin'], undefined)
  await app.close()
})

test('exposing headers does not widen the allow-list: the origin list is exactly CORS_ORIGIN plus ADMIN_ORIGIN', async () => {
  const app = await buildApp()
  for (const origin of [ALLOWED, ADMIN]) {
    const res = await app.inject({ method: 'GET', url: '/x', headers: { origin } })
    assert.strictEqual(res.headers['access-control-allow-origin'], origin)
  }
  const other = await app.inject({ method: 'GET', url: '/x', headers: { origin: 'https://app.tenda.test.evil.example' } })
  assert.strictEqual(other.headers['access-control-allow-origin'], undefined)
  await app.close()
})

test('an admin route refuses a browser origin that is allowed for the app but is not the admin origin', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/v1/admin/x', headers: { origin: ALLOWED } })
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'FORBIDDEN')
  await app.close()
})

test('an admin route answers the admin origin', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/v1/admin/x', headers: { origin: ADMIN } })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.headers['access-control-allow-origin'], ADMIN)
  await app.close()
})

test('an admin route answers a request with no Origin header: a non-browser client relies on its JWT', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/v1/admin/x' })
  assert.strictEqual(res.statusCode, 200)
  await app.close()
})

test('the admin-origin check applies to /v1/admin/ only: the same app origin still reaches a public route', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/x', headers: { origin: ALLOWED } })
  assert.strictEqual(res.statusCode, 200)
  await app.close()
})
