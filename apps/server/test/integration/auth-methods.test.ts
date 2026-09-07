/**
 * GET /v1/auth/methods — the "Sign-in & security" read surface. Asserts it
 * returns the caller's non-wallet identities with the right verified flag and
 * email, EXCLUDES wallets (those ride /v1/users/me), is scoped to the caller,
 * and rejects anonymous access.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { user_identities, user_wallets } from '@tenda/shared/db/schema'
import type { LoginMethodsResponse } from '@tenda/shared'
import { TEST_DB_CONFIGURED, useTestApp, createUser, resetDb } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

beforeEach(async () => {
  if (!skip) await resetDb(getApp())
})

let seq = 0
const uniqEmail = (): string => `m${(seq += 1)}@example.com`
const uniqPhone = (): string => `+23481${String((seq += 1)).padStart(8, '0')}`

function getMethods(app: ReturnType<typeof getApp>, token?: string) {
  return app.inject({
    method: 'GET',
    url: '/v1/auth/methods',
    headers: token !== undefined ? { authorization: `Bearer ${token}` } : {},
  })
}

test('methods: 401 without a bearer token', { skip }, async () => {
  const res = await getMethods(getApp())
  assert.strictEqual(res.statusCode, 401)
})

test('methods: returns the caller identities with verified flags, excluding wallets', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const email = uniqEmail()
  const phone = uniqPhone()

  // A verified email identity, an UNverified phone identity, and a wallet.
  await app.db.insert(user_identities).values([
    { user_id: user.row.id, kind: 'email', identifier: email, email, verified_at: new Date() },
    { user_id: user.row.id, kind: 'phone', identifier: phone, email: null, verified_at: null },
  ])
  await app.db.insert(user_wallets).values({
    chain_ns: 'solana',
    address: `SoMethods${user.row.id.replace(/-/g, '')}`,
    user_id: user.row.id,
    is_primary: true,
    verified_at: new Date(),
  })

  const res = await getMethods(app, user.token)
  assert.strictEqual(res.statusCode, 200)
  const body = res.json() as LoginMethodsResponse

  // No wallet leaks into this surface.
  assert.strictEqual(body.identities.length, 2)
  const byKind = Object.fromEntries(body.identities.map((i) => [i.kind, i]))

  assert.deepStrictEqual(byKind.email, { kind: 'email', identifier: email, email, verified: true })
  assert.strictEqual(byKind.phone.verified, false)
  assert.strictEqual(byKind.phone.identifier, phone)
  assert.strictEqual(byKind.phone.email, null)
})

test('methods: an account with no identities returns an empty list', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const res = await getMethods(app, user.token)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual((res.json() as LoginMethodsResponse).identities, [])
})

test('methods: is scoped to the caller (another user\'s identities never appear)', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const other = await createUser(app)
  const otherEmail = uniqEmail()
  await app.db.insert(user_identities).values({
    user_id: other.row.id, kind: 'email', identifier: otherEmail, email: otherEmail, verified_at: new Date(),
  })

  const res = await getMethods(app, me.token)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual((res.json() as LoginMethodsResponse).identities, [])
})
