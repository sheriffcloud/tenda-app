// `../helpers/oauth-env` FIRST and for its side effect: it sets the Google
// audience before anything reads config, which is what puts a google strategy
// in the registry for this process. See that file for why the ordering is the
// whole mechanism.
import { GOOGLE_TEST_AUDIENCE } from '../helpers/oauth-env'
import { test, afterEach } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'
import { restoreFetch, stubFetch } from '../helpers/fetch-stub'

/**
 * POST /v1/auth/verify's OAUTH arm (#109).
 *
 * Google and Apple sign-in had no integration coverage at all: the harness
 * configures neither audience, so `buildAuthStrategies` omits both providers and
 * the route answers UNSUPPORTED_AUTH_METHOD before `parseProof` is ever called.
 * That left `parseProof`'s google/apple arm — the whole proof construction for a
 * login method — executed by nothing.
 *
 * WHAT IS AND IS NOT EXERCISED HERE. The token VERIFICATION logic (signature,
 * iss/aud/exp, the email_verified coercion) belongs to `createOidcVerifier` and
 * is unit-tested against a real locally-signed keypair in test/unit/oidc.test.ts.
 * What had no test was the ROUTE: that a configured provider reaches the proof
 * builder, that the proof carries the id_token, and that an unverifiable token
 * comes back as one uniform 401 rather than a 500.
 *
 * NO NETWORK. The production Google verifier wraps a remote JWKS, so every case
 * runs with `fetch` stubbed and asserts the recorder stayed EMPTY — a malformed
 * token is rejected by jose before it ever resolves a key, and if that ever
 * stopped being true this suite would start reaching for Google's servers.
 */
const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

afterEach(restoreFetch)

test('google: a configured provider reaches the proof builder, which requires id_token', { skip }, async () => {
  // From `requireNonEmptyString(body.id_token, 'id_token')` inside the
  // google/apple arm, so this case is what says that arm ran at all.
  //
  // 400, not 422 — measured, having expected the other one. `requireNonEmptyString`
  // is the shared shape guard and answers 400 for "missing or wrong type", which
  // is the rule lib/errors.ts states; the 422s elsewhere in this surface are
  // content refusals. The status is pinned rather than the code alone because
  // both answers carry VALIDATION_ERROR.
  const app = getApp()
  const calls = stubFetch()

  for (const id_token of [undefined, '', 42, null]) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { method: 'google', id_token },
    })
    assert.strictEqual(res.statusCode, 400, `${String(id_token)}: ${res.body}`)
    assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
    assert.match(res.json().message, /id_token is required/)
  }
  assert.strictEqual(calls.length, 0, 'a missing id_token must not reach the provider')
})

test('google: a token that will not verify is ONE uniform 401, not a 500', { skip }, async () => {
  // Three shapes that fail at different depths of jose — not a JWT at all, a
  // JWT-shaped string with undecodable segments, and an unsigned one. All three
  // must come back as the same 401: the route must never leak which part of a
  // token was wrong, and must never let jose's throw escape as INTERNAL_ERROR.
  const app = getApp()
  const calls = stubFetch()

  for (const id_token of ['not-a-jwt', 'aaa.bbb.ccc', 'eyJhbGciOiJub25lIn0..']) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { method: 'google', id_token },
    })
    assert.strictEqual(res.statusCode, 401, `${id_token}: ${res.body}`)
    assert.strictEqual(res.json().code, 'INVALID_SIGNATURE')
    assert.match(res.json().message, /OAuth token verification failed/)
  }
  assert.strictEqual(calls.length, 0, 'jose rejects these before resolving a key')
})

test('apple: no configured audience means the method does not exist', { skip }, async () => {
  // The control, and the point of the split configuration: the same route, the
  // same well-formed body, refused earlier and differently because the registry
  // has no apple strategy. It is CONFIGURATION that decides which methods a
  // deployment offers, and this is what proves the google cases above are not
  // simply "the route answers everything".
  const app = getApp()
  const calls = stubFetch()

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/verify',
    payload: { method: 'apple', id_token: 'not-a-jwt' },
  })
  assert.strictEqual(res.statusCode, 400, res.body)
  assert.strictEqual(res.json().code, 'UNSUPPORTED_AUTH_METHOD')
  assert.match(res.json().message, /not supported yet/)
  assert.strictEqual(calls.length, 0)

  // ...and the audience the google strategy was built with is the one this
  // file's env module set, so the two providers differ by configuration alone.
  assert.strictEqual(GOOGLE_TEST_AUDIENCE, process.env.GOOGLE_OAUTH_CLIENT_IDS)
})
