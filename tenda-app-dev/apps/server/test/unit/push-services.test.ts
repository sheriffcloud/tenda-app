/**
 * lib/push-services — JWT shapes (decoded + verified against real
 * keypairs), provider-token caching, per-platform routing with loud
 * degradation, unregistered-token accounting.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { generateKeyPairSync, createVerify, verify as cryptoVerify } from 'node:crypto'
import {
  APNS_TOKEN_REFRESH_MS,
  FCM_SCOPE,
  FCM_TOKEN_URL,
  buildApnsJwt,
  buildFcmAssertion,
  apnsPushService,
  fcmPushService,
  routePush,
  type ApnsTransport,
  type FcmTransport,
  type PlatformToken,
} from '@server/lib/push-services'
import type { PushService } from '@server/chains/types'

const NOW = 1_900_000_000_000

function decodeSegment(jwt: string, i: number): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[i], 'base64url').toString())
}

// ---------- FCM assertion ------------------------------------------------------

const RSA = generateKeyPairSync('rsa', { modulusLength: 2048 })
const FCM_ACCOUNT = {
  project_id: 'tenda-test',
  client_email: 'svc@tenda-test.iam.gserviceaccount.com',
  private_key: RSA.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
}

test('buildFcmAssertion: RS256 JWT with correct claims, verifiable signature', () => {
  const jwt = buildFcmAssertion(FCM_ACCOUNT, NOW)
  const [h, c, s] = jwt.split('.')
  assert.deepStrictEqual(decodeSegment(jwt, 0), { alg: 'RS256', typ: 'JWT' })
  const claims = decodeSegment(jwt, 1)
  assert.strictEqual(claims.iss, FCM_ACCOUNT.client_email)
  assert.strictEqual(claims.scope, FCM_SCOPE)
  assert.strictEqual(claims.aud, FCM_TOKEN_URL)
  assert.strictEqual(claims.exp, (claims.iat as number) + 3600)

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${h}.${c}`)
  assert.strictEqual(verifier.verify(RSA.publicKey, Buffer.from(s, 'base64url')), true)
})

test('fcmPushService caches the access token within the refresh window', async () => {
  let exchanges = 0
  const transport: FcmTransport = {
    async exchangeToken() {
      exchanges += 1
      return { access_token: `tok-${exchanges}` }
    },
    async send() {
      return 'ok'
    },
  }
  let now = NOW
  const svc = fcmPushService({
    account: FCM_ACCOUNT,
    transport,
    log: { warn() {} },
    now: () => now,
  })
  await svc.send({ tokens: ['a'], title: 't', body: 'b' })
  await svc.send({ tokens: ['b'], title: 't', body: 'b' })
  assert.strictEqual(exchanges, 1)
  now += 51 * 60_000 // past the refresh horizon
  await svc.send({ tokens: ['c'], title: 't', body: 'b' })
  assert.strictEqual(exchanges, 2)
})

test('fcm: unregistered tokens count as failed; transport errors never throw', async () => {
  const transport: FcmTransport = {
    async exchangeToken() {
      return { access_token: 'tok' }
    },
    async send({ token }) {
      if (token === 'gone') return 'unregistered'
      if (token === 'boom') throw new Error('500')
      return 'ok'
    },
  }
  const svc = fcmPushService({
    account: FCM_ACCOUNT,
    transport,
    log: { warn() {} },
    now: () => NOW,
  })
  const r = await svc.send({ tokens: ['ok1', 'gone', 'boom'], title: 't', body: 'b' })
  // Only the provider-reported-GONE token is prunable — the transport
  // error ('boom') counts failed but must never be deleted.
  assert.deepStrictEqual(r, { ok: 1, failed: 2, invalid_tokens: ['gone'] })
})

// ---------- APNs JWT --------------------------------------------------------------

const EC = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const APNS_CREDS = {
  key_id: 'KEY123',
  team_id: 'TEAM456',
  private_key: EC.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  topic: 'com.tenda.app',
}

test('buildApnsJwt: ES256 JWT with kid header and iss/iat claims, verifiable', () => {
  const jwt = buildApnsJwt(APNS_CREDS, NOW)
  assert.deepStrictEqual(decodeSegment(jwt, 0), { alg: 'ES256', kid: 'KEY123' })
  const claims = decodeSegment(jwt, 1)
  assert.strictEqual(claims.iss, 'TEAM456')
  assert.strictEqual(claims.iat, Math.floor(NOW / 1000))

  const [h, c, s] = jwt.split('.')
  const ok = cryptoVerify(
    'sha256',
    Buffer.from(`${h}.${c}`),
    { key: EC.publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(s, 'base64url'),
  )
  assert.strictEqual(ok, true)
})

test('apnsPushService reuses the provider JWT for the Apple-sanctioned window', async () => {
  const jwts = new Set<string>()
  const transport: ApnsTransport = {
    async send({ jwt }) {
      jwts.add(jwt)
      return 'ok'
    },
  }
  let now = NOW
  const svc = apnsPushService({
    creds: APNS_CREDS,
    transport,
    log: { warn() {} },
    now: () => now,
  })
  await svc.send({ tokens: ['a', 'b'], title: 't', body: 'b' })
  assert.strictEqual(jwts.size, 1)
  now += APNS_TOKEN_REFRESH_MS + 1
  await svc.send({ tokens: ['c'], title: 't', body: 'b' })
  assert.strictEqual(jwts.size, 2)
})

test('apns: 410 tokens land in invalid_tokens; transport errors do not', async () => {
  const transport: ApnsTransport = {
    async send({ token }) {
      if (token === 'gone410') return 'unregistered'
      if (token === 'boom') throw new Error('h2 stream error')
      return 'ok'
    },
  }
  const svc = apnsPushService({
    creds: APNS_CREDS,
    transport,
    log: { warn() {} },
    now: () => NOW,
  })
  const r = await svc.send({ tokens: ['live', 'gone410', 'boom'], title: 't', body: 'b' })
  assert.deepStrictEqual(r, { ok: 1, failed: 2, invalid_tokens: ['gone410'] })
})

// ---------- router ------------------------------------------------------------------

function countingService(): PushService & { seen: string[] } {
  const seen: string[] = []
  return {
    seen,
    async send({ tokens }) {
      seen.push(...tokens)
      return { ok: tokens.length, failed: 0, invalid_tokens: [] }
    },
  }
}

test('routePush aggregates invalid_tokens across services; unconfigured tokens are never prunable', async () => {
  const fcm: PushService = {
    async send({ tokens }) {
      return { ok: 0, failed: tokens.length, invalid_tokens: [...tokens] }
    },
  }
  const tokens: PlatformToken[] = [
    { token: 'dead-f', platform: 'fcm' },
    { token: 'a1', platform: 'apns' }, // unconfigured — failed, NOT invalid
  ]
  const r = await routePush({ services: { fcm }, log: { warn() {} } }, tokens, { title: 't', body: 'b' })
  assert.deepStrictEqual(r, { ok: 0, failed: 2, invalid_tokens: ['dead-f'] })
})

test('routePush splits by platform; unconfigured platforms fail loudly', async () => {
  const fcm = countingService()
  const expo = countingService()
  const warned: string[] = []
  const tokens: PlatformToken[] = [
    { token: 'f1', platform: 'fcm' },
    { token: 'e1', platform: 'expo' },
    { token: 'a1', platform: 'apns' }, // unconfigured
    { token: 'f2', platform: 'fcm' },
  ]
  const r = await routePush(
    {
      services: { fcm, expo },
      log: {
        warn(_o, msg) {
          warned.push(msg)
        },
      },
    },
    tokens,
    { title: 't', body: 'b' },
  )
  assert.deepStrictEqual(fcm.seen, ['f1', 'f2'])
  assert.deepStrictEqual(expo.seen, ['e1'])
  assert.deepStrictEqual(r, { ok: 3, failed: 1, invalid_tokens: [] })
  assert.strictEqual(warned.length, 1)
})

test('routePush with no tokens is a clean zero', async () => {
  const r = await routePush({ services: {}, log: { warn() {} } }, [], { title: 't', body: 'b' })
  assert.deepStrictEqual(r, { ok: 0, failed: 0, invalid_tokens: [] })
})
