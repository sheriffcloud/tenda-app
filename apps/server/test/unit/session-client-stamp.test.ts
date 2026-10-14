/**
 * The session client stamp (#53c-1): what reaches the token, and what does not.
 *
 * A generic session fact, so it is tested as one — nothing here mentions the
 * gas seed. The properties that matter are that an unknown value cannot be
 * copied into a signed token, that an absent one leaves no field behind, and
 * that sign-in keeps working for every client that says nothing at all.
 */

import { before, test } from 'node:test'
import assert from 'node:assert'
import { SESSION_CLIENT_HEADER, SESSION_CLIENTS, parseSessionClient } from '@tenda/shared'
import type { User } from '@tenda/shared'
import { mintAuthResponse, sessionClientFromHeaders, type TokenSigner } from '@server/features/auth/session/session'
import { AppError } from '@server/lib/errors'

/**
 * `mintAuthResponse` reads `JWT_EXPIRES_IN` from config, and `loadConfig`
 * refuses to answer without the required vars. The same minimal fixture
 * config-env.test.ts uses — set once, since nothing here mutates it.
 */
before(() => {
  process.env.DATABASE_URL ??= 'postgres://localhost/test'
  process.env.JWT_SECRET ??= 'secret'
  process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
  process.env.CLOUDINARY_API_KEY ??= 'test-key'
  process.env.CLOUDINARY_API_SECRET ??= 'test-secret'
  process.env.API_BASE_URL ??= 'https://api.tenda.test'
})

/** Records the claims it was asked to sign, instead of signing them. */
function recordingSigner(): { signer: TokenSigner; signed: object[] } {
  const signed: object[] = []
  return {
    signed,
    signer: {
      jwt: {
        sign(payload) {
          signed.push(payload)
          return 'signed.jwt.token'
        },
      },
    },
  }
}

const USER = { id: 'u-1', role: 'user', status: 'active' } as User

// ---------- parsing ---------------------------------------------------------------

test('a known client parses; an unknown one reads as absent rather than throwing', () => {
  assert.strictEqual(parseSessionClient('mobile'), 'mobile')
  assert.strictEqual(parseSessionClient('web'), 'web')
  // Refusing a sign-in over a header nobody depends on would turn a cosmetic
  // mismatch — an old build, a typo, a probe — into an outage.
  assert.strictEqual(parseSessionClient('desktop'), null)
  assert.strictEqual(parseSessionClient(''), null)
  assert.strictEqual(parseSessionClient(undefined), null)
})

test('every declared client parses back to itself', () => {
  // Guards the allowlist against a value being added to SESSION_CLIENTS in a
  // shape the parser cannot return (a trimmed or cased variant).
  for (const client of SESSION_CLIENTS) {
    assert.strictEqual(parseSessionClient(client), client)
  }
})

test('a REPEATED header is unwrapped, not silently dropped', () => {
  // Node hands back string[] for a repeated header. A mint site that forgot to
  // unwrap it would stamp nothing — the failure that looks like the feature
  // simply not working, on exactly the requests that do send a stamp.
  assert.strictEqual(sessionClientFromHeaders({ [SESSION_CLIENT_HEADER]: ['mobile', 'web'] }), 'mobile')
  assert.strictEqual(sessionClientFromHeaders({ [SESSION_CLIENT_HEADER]: 'mobile' }), 'mobile')
  assert.strictEqual(sessionClientFromHeaders({}), null)
})

// ---------- minting ----------------------------------------------------------------

test('a stamped session carries the client in its claims', () => {
  const { signer, signed } = recordingSigner()
  mintAuthResponse(signer, USER, 'mobile')
  assert.deepStrictEqual(signed, [{ id: 'u-1', role: 'user', client: 'mobile' }])
})

test('an unstamped session carries NO client key at all', () => {
  // Not `client: undefined`: the claim would still be present in the payload
  // object, and a reader testing `'client' in payload` would see a session that
  // never said anything as one that did.
  const { signer, signed } = recordingSigner()
  mintAuthResponse(signer, USER)
  assert.deepStrictEqual(signed, [{ id: 'u-1', role: 'user' }])
  assert.strictEqual(Object.hasOwn(signed[0] ?? {}, 'client'), false)
})

test('the token still carries no wallet or PII beyond id and role', () => {
  // The stamp is an addition to a deliberately minimal claim set (cutover §11).
  // A future field slipping in here would ship in every live session.
  const { signer, signed } = recordingSigner()
  mintAuthResponse(signer, USER, 'web')
  assert.deepStrictEqual(Object.keys(signed[0] ?? {}).sort(), ['client', 'id', 'role'])
})

test('the suspended gate still fires, stamp or no stamp', () => {
  const { signer, signed } = recordingSigner()
  for (const client of ['mobile', null] as const) {
    assert.throws(
      () => mintAuthResponse(signer, { ...USER, status: 'suspended' }, client),
      (err: unknown) => err instanceof AppError && err.statusCode === 403,
    )
  }
  assert.deepStrictEqual(signed, [], 'signed a token for a suspended account')
})
