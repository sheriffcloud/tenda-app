/**
 * Stage 9A — lib/auth/resolver unit/integration tests against the real DB.
 * Adversarial-first: each helper is probed for the way it could go wrong
 * (unverified email must NOT dedup; wrong-kind must NOT match; last
 * credential must block; phone-vs-email contact distinction).
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { user_identities, user_wallets } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import {
  resolveUserByIdentity,
  resolveUserByWallet,
  findUserByVerifiedEmail,
  listLoginMethods,
  countLoginMethods,
  assertNotLastCredential,
  hasVerifiedPhone,
  hasVerifiedContact,
} from '@server/lib/auth/resolver'
import { TEST_DB_CONFIGURED, useTestApp, createUser, resetDb } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

beforeEach(async () => {
  if (!skip) await resetDb(getApp())
})

let idSeq = 0
const uniq = (p: string): string => `${p}_${(idSeq += 1)}`

async function addIdentity(
  kind: 'phone' | 'email' | 'google' | 'apple',
  identifier: string,
  userId: string,
  opts: { email?: string | null; verified?: boolean } = {},
): Promise<void> {
  await getApp().db.insert(user_identities).values({
    user_id: userId,
    kind,
    identifier,
    email: opts.email ?? null,
    verified_at: opts.verified === false ? null : new Date(),
  })
}

async function addWallet(address: string, userId: string): Promise<void> {
  await getApp().db
    .insert(user_wallets)
    .values({ chain_ns: 'solana', address, user_id: userId, is_primary: false })
}

test('resolveUserByIdentity — finds owner, null when unknown, kind-scoped', { skip }, async () => {
  const { row } = await createUser(getApp())
  const phone = uniq('+23480')
  await addIdentity('phone', phone, row.id)

  assert.strictEqual(await resolveUserByIdentity(getApp().db, { kind: 'phone', identifier: phone }), row.id)
  // Unknown identifier.
  assert.strictEqual(await resolveUserByIdentity(getApp().db, { kind: 'phone', identifier: uniq('+1') }), null)
  // Same identifier under a DIFFERENT kind must NOT match (composite key).
  assert.strictEqual(await resolveUserByIdentity(getApp().db, { kind: 'email', identifier: phone }), null)
})

test('resolveUserByWallet — finds owner, null when unknown', { skip }, async () => {
  const { row } = await createUser(getApp())
  const addr = uniq('SolAddr')
  await addWallet(addr, row.id)
  assert.strictEqual(await resolveUserByWallet(getApp().db, { chain_ns: 'solana', address: addr }), row.id)
  assert.strictEqual(await resolveUserByWallet(getApp().db, { chain_ns: 'solana', address: uniq('Nope') }), null)
})

test('resolveUserByWallet — eip155 is case-insensitive; solana is NOT', { skip }, async () => {
  const { row } = await createUser(getApp())
  // A legacy row stored MIXED-CASE: login derives the address fresh from the
  // signature (any case) and must still resolve the owner.
  const evm = `0xAbC${(idSeq += 1).toString(16).padStart(37, '0')}`
  await getApp().db
    .insert(user_wallets)
    .values({ chain_ns: 'eip155', address: evm, user_id: row.id, is_primary: false })
  assert.strictEqual(
    await resolveUserByWallet(getApp().db, { chain_ns: 'eip155', address: evm.toLowerCase() }),
    row.id,
  )
  assert.strictEqual(
    await resolveUserByWallet(getApp().db, { chain_ns: 'eip155', address: evm.toUpperCase() }),
    row.id,
  )

  // Solana stays case-sensitive — an upper-cased base58 string is a different
  // address and must NOT resolve to the owner.
  const sol = uniq('SolCase')
  await addWallet(sol, row.id)
  assert.strictEqual(
    await resolveUserByWallet(getApp().db, { chain_ns: 'solana', address: sol.toUpperCase() }),
    null,
  )
})

test('findUserByVerifiedEmail — cross-method, but VERIFIED only', { skip }, async () => {
  const { row } = await createUser(getApp())
  const email = uniq('a') + '@x.io'
  // An OAuth-style row carrying the verified email under a non-email kind.
  await addIdentity('google', uniq('sub'), row.id, { email, verified: true })
  assert.strictEqual(await findUserByVerifiedEmail(getApp().db, email), row.id)

  // An UNVERIFIED email row must never dedup (would let an attacker claim it).
  const { row: row2 } = await createUser(getApp())
  const email2 = uniq('b') + '@x.io'
  await addIdentity('email', email2, row2.id, { email: email2, verified: false })
  assert.strictEqual(await findUserByVerifiedEmail(getApp().db, email2), null)
})

test('listLoginMethods + countLoginMethods — unions identities and wallets', { skip }, async () => {
  const { row } = await createUser(getApp())
  await addIdentity('email', uniq('c') + '@x.io', row.id, { email: uniq('c') + '@x.io', verified: true })
  await addWallet(uniq('W'), row.id)

  const methods = await listLoginMethods(getApp().db, row.id)
  assert.strictEqual(methods.length, 2)
  const emailMethod = methods.find((m) => m.type === 'identity' && m.kind === 'email')
  assert.ok(emailMethod && emailMethod.type === 'identity')
  // The display fields the Sign-in & security screen reads.
  assert.strictEqual(emailMethod.verified, true)
  assert.ok(emailMethod.email && emailMethod.email.includes('@'))
  assert.ok(methods.some((m) => m.type === 'wallet'))
  assert.strictEqual(await countLoginMethods(getApp().db, row.id), 2)
})

test('assertNotLastCredential — blocks at 1, passes above', { skip }, async () => {
  const { row } = await createUser(getApp())
  await addIdentity('phone', uniq('+44'), row.id)
  // Exactly one method → removing it would lock the user out.
  await assert.rejects(
    () => assertNotLastCredential(getApp().db, row.id),
    (e: unknown) => e instanceof AppError && e.code === ErrorCode.LAST_CREDENTIAL && e.statusCode === 409,
  )
  // Add a second → guard passes.
  await addWallet(uniq('W'), row.id)
  await assert.doesNotReject(() => assertNotLastCredential(getApp().db, row.id))
})

test('hasVerifiedPhone — true only for a verified phone identity', { skip }, async () => {
  const { row } = await createUser(getApp())
  assert.strictEqual(await hasVerifiedPhone(getApp().db, row.id), false)
  await addIdentity('phone', uniq('+1'), row.id, { verified: false })
  assert.strictEqual(await hasVerifiedPhone(getApp().db, row.id), false, 'unverified phone must not count')
  await addIdentity('phone', uniq('+2'), row.id, { verified: true })
  assert.strictEqual(await hasVerifiedPhone(getApp().db, row.id), true)
})

test('hasVerifiedContact — verified phone OR verified email; none otherwise', { skip }, async () => {
  // No identities → no contact.
  const { row: a } = await createUser(getApp())
  assert.strictEqual(await hasVerifiedContact(getApp().db, a.id), false)

  // Verified phone → contact.
  const { row: b } = await createUser(getApp())
  await addIdentity('phone', uniq('+3'), b.id, { verified: true })
  assert.strictEqual(await hasVerifiedContact(getApp().db, b.id), true)

  // Verified OAuth email → contact.
  const { row: c } = await createUser(getApp())
  await addIdentity('apple', uniq('sub'), c.id, { email: uniq('d') + '@x.io', verified: true })
  assert.strictEqual(await hasVerifiedContact(getApp().db, c.id), true)

  // Wallet-only (no identities) → NOT a contact.
  const { row: d } = await createUser(getApp())
  await addWallet(uniq('W'), d.id)
  assert.strictEqual(await hasVerifiedContact(getApp().db, d.id), false)
})
