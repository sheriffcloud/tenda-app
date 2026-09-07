/**
 * lib/auth/oidc — OIDC id_token verification. Uses a locally-generated RSA
 * keypair + createLocalJWKSet so the tests drive the REAL jose signature +
 * claim verification (not a mock): valid token, expired, wrong audience,
 * wrong issuer, bad signature, missing sub, and email_verified coercion.
 */

import { test, before } from 'node:test'
import * as assert from 'node:assert'
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWTVerifyGetKey } from 'jose'
import { AppError } from '@server/lib/errors'
import { createOidcVerifier, GOOGLE_ISSUERS } from '@server/lib/auth/oidc'

const ISS = 'https://accounts.google.com'
const AUD = 'client-abc.apps.googleusercontent.com'
const KID = 'test-key-1'

let keys: JWTVerifyGetKey
let sign: (claims: Record<string, unknown>, opts?: { iss?: string; aud?: string; expSec?: number }) => Promise<string>
let signWithForeignKey: (claims: Record<string, unknown>) => Promise<string>

before(async () => {
  const pair = await generateKeyPair('RS256')
  const jwk = await exportJWK(pair.publicKey)
  jwk.kid = KID
  jwk.alg = 'RS256'
  keys = createLocalJWKSet({ keys: [jwk] })

  const nowSec = Math.floor(Date.now() / 1000)
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer(opts.iss ?? ISS)
      .setAudience(opts.aud ?? AUD)
      .setIssuedAt(nowSec)
      .setExpirationTime(opts.expSec ?? nowSec + 3600)
      .sign(pair.privateKey)

  // A second key NOT in the published JWKS — signature must fail to verify.
  const foreign = await generateKeyPair('RS256')
  signWithForeignKey = (claims) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + 3600)
      .sign(foreign.privateKey)
})

function verifier() {
  return createOidcVerifier({ keys, issuer: GOOGLE_ISSUERS, audiences: [AUD] })
}

async function expectRejected(token: string): Promise<void> {
  await assert.rejects(
    () => verifier().verify(token),
    (e: unknown) => e instanceof AppError && e.statusCode === 401,
  )
}

test('valid token → { sub, email } with a verified email', async () => {
  const token = await sign({ sub: 'google-sub-123', email: 'Alice@Example.com', email_verified: true })
  const claims = await verifier().verify(token)
  assert.strictEqual(claims.sub, 'google-sub-123')
  assert.strictEqual(claims.email, 'alice@example.com') // lowercased
})

test('email_verified coercion: string "true" verified; false / missing → null', async () => {
  const asString = await sign({ sub: 's1', email: 'a@x.io', email_verified: 'true' })
  assert.strictEqual((await verifier().verify(asString)).email, 'a@x.io')

  const unverified = await sign({ sub: 's2', email: 'b@x.io', email_verified: false })
  assert.strictEqual((await verifier().verify(unverified)).email, null)

  const noEmail = await sign({ sub: 's3' })
  assert.strictEqual((await verifier().verify(noEmail)).email, null)
})

test('rejects: expired, wrong audience, wrong issuer, bad signature, missing sub', async () => {
  const nowSec = Math.floor(Date.now() / 1000)
  await expectRejected(await sign({ sub: 's' }, { expSec: nowSec - 3600 })) // expired (beyond tolerance)
  await expectRejected(await sign({ sub: 's' }, { aud: 'someone-else' })) // wrong aud
  await expectRejected(await sign({ sub: 's' }, { iss: 'https://evil.example' })) // wrong iss
  await expectRejected(await signWithForeignKey({ sub: 's' })) // signature doesn't verify
  await expectRejected(await sign({ email: 'a@x.io', email_verified: true })) // no sub
  await expectRejected('not.a.jwt') // garbage
})

test('accepts the bare "accounts.google.com" issuer spelling', async () => {
  const token = await sign({ sub: 's' }, { iss: 'accounts.google.com' })
  assert.strictEqual((await verifier().verify(token)).sub, 's')
})
