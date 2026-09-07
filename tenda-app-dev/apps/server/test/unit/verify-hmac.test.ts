import { test } from 'node:test'
import * as assert from 'node:assert'
import { createHmac } from 'node:crypto'
import { verifyHmac, MAX_PAYLOAD_BYTES } from '@server/core/webhooks/verify-hmac'

const SECRET = 'test-shared-secret'
const PAYLOAD = '{"event":"EscrowAccepted","tx":"abc"}'

function hmacHex(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

function hmacBase64(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64')
}

test('verifyHmac: valid hex signature → true', () => {
  const sig = hmacHex(PAYLOAD, SECRET)
  assert.strictEqual(verifyHmac({ payload: PAYLOAD, signature: sig, secret: SECRET }), true)
})

test('verifyHmac: valid 0x-prefixed hex signature → true', () => {
  const sig = '0x' + hmacHex(PAYLOAD, SECRET)
  assert.strictEqual(verifyHmac({ payload: PAYLOAD, signature: sig, secret: SECRET }), true)
})

test('verifyHmac: valid base64 signature → true', () => {
  const sig = hmacBase64(PAYLOAD, SECRET)
  assert.strictEqual(
    verifyHmac({ payload: PAYLOAD, signature: sig, secret: SECRET, encoding: 'base64' }),
    true,
  )
})

test('verifyHmac: tampered payload → false', () => {
  const sig = hmacHex(PAYLOAD, SECRET)
  assert.strictEqual(
    verifyHmac({ payload: PAYLOAD + 'tampered', signature: sig, secret: SECRET }),
    false,
  )
})

test('verifyHmac: wrong secret → false', () => {
  const sig = hmacHex(PAYLOAD, SECRET)
  assert.strictEqual(
    verifyHmac({ payload: PAYLOAD, signature: sig, secret: 'wrong-secret' }),
    false,
  )
})

test('verifyHmac: empty signature → false (no crash)', () => {
  assert.strictEqual(verifyHmac({ payload: PAYLOAD, signature: '', secret: SECRET }), false)
})

test('verifyHmac: odd-length hex → false (no crash)', () => {
  assert.strictEqual(verifyHmac({ payload: PAYLOAD, signature: 'abc', secret: SECRET }), false)
})

test('verifyHmac: non-hex characters → false (no crash)', () => {
  assert.strictEqual(
    verifyHmac({ payload: PAYLOAD, signature: 'not-hex-zz!!', secret: SECRET }),
    false,
  )
})

test('verifyHmac: hex sig provided but encoding=base64 → false (length mismatch)', () => {
  const sig = hmacHex(PAYLOAD, SECRET)
  assert.strictEqual(
    verifyHmac({ payload: PAYLOAD, signature: sig, secret: SECRET, encoding: 'base64' }),
    false,
  )
})

test('verifyHmac: sha512 algorithm round-trip → true', () => {
  const sig = createHmac('sha512', SECRET).update(PAYLOAD).digest('hex')
  assert.strictEqual(
    verifyHmac({ payload: PAYLOAD, signature: sig, secret: SECRET, algorithm: 'sha512' }),
    true,
  )
})

test('verifyHmac: short sig of correct charset → false (length mismatch, no crash)', () => {
  // 'abcdef' is valid hex, but too short to match sha256 digest length (32 bytes).
  assert.strictEqual(
    verifyHmac({ payload: PAYLOAD, signature: 'abcdef', secret: SECRET }),
    false,
  )
})

test('verifyHmac: Buffer payload accepted', () => {
  const buf = Buffer.from(PAYLOAD)
  const sig = hmacHex(PAYLOAD, SECRET)
  assert.strictEqual(verifyHmac({ payload: buf, signature: sig, secret: SECRET }), true)
})

// Deterministic payload whose HMAC-SHA256 with SECRET produces a base64 sig
// containing BOTH '+' and '/' — verified once offline. Used by the base64url
// tests so they actually exercise the alphabet-translation path.
const ENCODING_TEST_PAYLOAD = 'payload-4'
const ENCODING_TEST_STD_SIG = '9YbFZedhbZ+qWcR/5RV6Te6lZ8FtWcgAzDrGWFVeY3M='

test('verifyHmac: encoding-test fixture sanity — chosen payload still produces +/ sig', () => {
  const computed = createHmac('sha256', SECRET).update(ENCODING_TEST_PAYLOAD).digest('base64')
  assert.strictEqual(computed, ENCODING_TEST_STD_SIG)
  assert.match(computed, /[+]/)
  assert.match(computed, /[/]/)
})

test('verifyHmac: URL-safe base64 signature accepted under encoding=base64url', () => {
  const urlSafe = ENCODING_TEST_STD_SIG
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  assert.strictEqual(
    verifyHmac({
      payload: ENCODING_TEST_PAYLOAD,
      signature: urlSafe,
      secret: SECRET,
      encoding: 'base64url',
    }),
    true,
  )
})

test('verifyHmac: URL-safe alphabet rejected under encoding=base64 (strict)', () => {
  const urlSafe = ENCODING_TEST_STD_SIG.replace(/\+/g, '-').replace(/\//g, '_')
  assert.strictEqual(
    verifyHmac({
      payload: ENCODING_TEST_PAYLOAD,
      signature: urlSafe,
      secret: SECRET,
      encoding: 'base64',
    }),
    false,
  )
})

test('verifyHmac: standard base64 rejected under encoding=base64url', () => {
  assert.strictEqual(
    verifyHmac({
      payload: ENCODING_TEST_PAYLOAD,
      signature: ENCODING_TEST_STD_SIG,
      secret: SECRET,
      encoding: 'base64url',
    }),
    false,
  )
})

test('verifyHmac: payload over MAX_PAYLOAD_BYTES rejected without HMAC compute', () => {
  const big = Buffer.alloc(MAX_PAYLOAD_BYTES + 1, 'x')
  const sig = createHmac('sha256', SECRET).update(big).digest('hex')
  assert.strictEqual(
    verifyHmac({ payload: big, signature: sig, secret: SECRET }),
    false,
  )
})
