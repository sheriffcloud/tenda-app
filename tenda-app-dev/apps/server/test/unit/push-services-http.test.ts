/**
 * lib/push-services — the NETWORK seams the sibling suite leaves untouched:
 *   - fcmHttpTransport: fetch-stubbed token exchange + send (404 prune,
 *     non-2xx throw)
 *   - apnsHttp2Transport: a real h2c loopback server (200 ok / 410 prune /
 *     500 reject) — exercises the lazy node:http2 path end-to-end
 *   - buildPushServices: config→services matrix (valid / bad-b64 /
 *     missing-fields FCM, APNS present-vs-absent, expo always)
 * Fully offline (loopback only).
 */

import { test, afterEach } from 'node:test'
import * as assert from 'node:assert'
import http2 from 'node:http2'
import {
  fcmHttpTransport,
  apnsHttp2Transport,
  buildPushServices,
} from '@server/lib/push-services'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

interface StubResponse {
  ok?: boolean
  status?: number
  json?: () => Promise<unknown>
}

function stubFetch(make: (url: string) => StubResponse): { url: string; init: { body?: unknown } }[] {
  const calls: { url: string; init: { body?: unknown } }[] = []
  globalThis.fetch = (async (url: string, init?: { body?: unknown }) => {
    calls.push({ url: String(url), init: init ?? {} })
    const r = make(String(url))
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: r.json ?? (async () => ({})),
    } as Response
  }) as typeof fetch
  return calls
}

const PAYLOAD = { title: 't', body: 'b' }

// ---------- fcmHttpTransport --------------------------------------------------

test('fcmHttpTransport.exchangeToken: posts the jwt-bearer grant, returns the token', async () => {
  const calls = stubFetch(() => ({ json: async () => ({ access_token: 'AT' }) }))
  const out = await fcmHttpTransport().exchangeToken('the-assertion')
  assert.strictEqual(out.access_token, 'AT')
  assert.strictEqual(calls[0].url, 'https://oauth2.googleapis.com/token')
  assert.match(String(calls[0].init.body), /grant_type=urn/)
  assert.match(String(calls[0].init.body), /assertion=the-assertion/)
})

test('fcmHttpTransport.exchangeToken: non-2xx throws', async () => {
  stubFetch(() => ({ ok: false, status: 401 }))
  await assert.rejects(() => fcmHttpTransport().exchangeToken('x'), /token exchange failed: 401/)
})

test('fcmHttpTransport.send: 200 → ok and hits the project messages endpoint', async () => {
  const calls = stubFetch(() => ({ status: 200 }))
  const r = await fcmHttpTransport().send({
    project_id: 'proj', access_token: 'AT', token: 'dev', payload: { ...PAYLOAD, data: { k: 'v' } },
  })
  assert.strictEqual(r, 'ok')
  assert.strictEqual(calls[0].url, 'https://fcm.googleapis.com/v1/projects/proj/messages:send')
  assert.match(String(calls[0].init.body), /"data":\{"k":"v"\}/)
})

test('fcmHttpTransport.send: 404 → unregistered (prunable); other non-2xx throws', async () => {
  stubFetch(() => ({ ok: false, status: 404 }))
  assert.strictEqual(
    await fcmHttpTransport().send({ project_id: 'p', access_token: 'AT', token: 'gone', payload: PAYLOAD }),
    'unregistered',
  )
  stubFetch(() => ({ ok: false, status: 500 }))
  await assert.rejects(
    () => fcmHttpTransport().send({ project_id: 'p', access_token: 'AT', token: 'x', payload: PAYLOAD }),
    /send failed: 500/,
  )
})

// ---------- apnsHttp2Transport (real h2c loopback) ----------------------------

function startH2(statusFor: (token: string) => number): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http2.createServer()
  server.on('stream', (stream, headers) => {
    const token = String(headers[':path']).split('/').pop() ?? ''
    stream.respond({ ':status': statusFor(token) })
    stream.end('')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

test('apnsHttp2Transport: 200 → ok, 410 → unregistered, 500 → reject', async () => {
  const srv = await startH2((token) => (token === 'gone' ? 410 : token === 'boom' ? 500 : 200))
  try {
    const transport = apnsHttp2Transport(srv.origin)
    const base = { jwt: 'jwt', topic: 'com.tenda.app', payload: PAYLOAD }
    assert.strictEqual(await transport.send({ ...base, token: 'live' }), 'ok')
    assert.strictEqual(await transport.send({ ...base, token: 'gone' }), 'unregistered')
    await assert.rejects(() => transport.send({ ...base, token: 'boom' }), /APNs responded 500/)
  } finally {
    await srv.close()
  }
})

// ---------- buildPushServices (config → services) -----------------------------

const SILENT = { warn() {}, error() {} }

function fcmB64(account: unknown): string {
  return Buffer.from(JSON.stringify(account)).toString('base64')
}

const NO_CONFIG = {
  FCM_SERVICE_ACCOUNT_B64: null,
  APNS_KEY_ID: null,
  APNS_TEAM_ID: null,
  APNS_PRIVATE_KEY_B64: null,
  APNS_TOPIC: null,
}

test('buildPushServices: expo is always present; no provider config = expo only', () => {
  const services = buildPushServices(NO_CONFIG, SILENT)
  assert.ok(services.expo !== undefined)
  assert.strictEqual(services.fcm, undefined)
  assert.strictEqual(services.apns, undefined)
})

test('buildPushServices: valid FCM service account enables fcm', () => {
  const services = buildPushServices(
    { ...NO_CONFIG, FCM_SERVICE_ACCOUNT_B64: fcmB64({ project_id: 'p', client_email: 'e', private_key: 'k' }) },
    SILENT,
  )
  assert.ok(services.fcm !== undefined)
})

test('buildPushServices: FCM with missing required fields is disabled + warned', () => {
  const warns: string[] = []
  const services = buildPushServices(
    { ...NO_CONFIG, FCM_SERVICE_ACCOUNT_B64: fcmB64({ project_id: 'p' }) }, // no client_email/private_key
    { warn: (_o, m) => warns.push(m), error() {} },
  )
  assert.strictEqual(services.fcm, undefined)
  assert.ok(warns.some((m) => /missing required fields/.test(m)))
})

test('buildPushServices: non-JSON FCM blob is caught + warned, never throws', () => {
  const warns: string[] = []
  const services = buildPushServices(
    { ...NO_CONFIG, FCM_SERVICE_ACCOUNT_B64: Buffer.from('not json at all').toString('base64') },
    { warn: (_o, m) => warns.push(m), error() {} },
  )
  assert.strictEqual(services.fcm, undefined)
  assert.ok(warns.some((m) => /not valid base64 JSON/.test(m)))
})

test('buildPushServices: full APNS config enables apns; partial does not', () => {
  const full = buildPushServices(
    { ...NO_CONFIG, APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY_B64: Buffer.from('pem').toString('base64'), APNS_TOPIC: 'com.x' },
    SILENT,
  )
  assert.ok(full.apns !== undefined)

  const partial = buildPushServices(
    { ...NO_CONFIG, APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY_B64: null, APNS_TOPIC: 'com.x' },
    SILENT,
  )
  assert.strictEqual(partial.apns, undefined)
})
