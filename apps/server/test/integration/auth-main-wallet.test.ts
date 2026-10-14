/**
 * POST /v1/auth/set-primary-wallet — the MAIN wallet, per chain family (#42).
 *
 * Split out of auth-wallets.test.ts when the per-chain cases pushed that file
 * past the 300-line ceiling; unlink keeps the original file. The seam is the
 * endpoint, so each file's failures name one route.
 *
 * The behaviour worth its own suite: the marker used to be one per ACCOUNT, so
 * choosing a wallet on one chain silently un-chose the user's wallet on every
 * other. Both halves are asserted here — that other families survive, and that
 * within one family the choice is still exclusive, at the DATABASE and not only
 * in the route.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { and, eq } from 'drizzle-orm'
import { user_wallets } from '@tenda/shared/db/schema/identity'
import {
  TEST_DB_CONFIGURED, useTestApp, createUser, authHeader, linkWallet, testEvmAddress,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()



// ---------- set-primary-wallet ---------------------------------------------------

test('set-primary-wallet: 422 on invalid input', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/set-primary-wallet', headers: authHeader(u.token), payload: {},
  })
  assert.strictEqual(res.statusCode, 422)
})

test('set-primary-wallet: 404 when the wallet is not linked', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/set-primary-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'solana', address: 'Unknown1111111111111111111111111111111111' },
  })
  assert.strictEqual(res.statusCode, 404)
})

test('set-primary-wallet: 200 swaps the primary marker', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await linkWallet(app, u.row.id, { is_primary: true })
  const next = await linkWallet(app, u.row.id, { is_primary: false })
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/set-primary-wallet', headers: authHeader(u.token),
    payload: { chain_ns: next.chain_ns, address: next.address },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().primary.address, next.address)
})

test('set-primary-wallet: matches a legacy mixed-case EVM row, returns the stored address', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await linkWallet(app, u.row.id, { is_primary: true })
  const mixed = testEvmAddress().replace('0x', '0xAbC').slice(0, 42)
  await app.db.insert(user_wallets).values({
    chain_ns: 'eip155', address: mixed, user_id: u.row.id, is_primary: false,
  })
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/set-primary-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'eip155', address: mixed.toLowerCase() }, // different case than stored
  })
  assert.strictEqual(res.statusCode, 200)
  // The response echoes the ACTUAL stored address, and the marker really moved.
  assert.strictEqual(res.json().primary.address, mixed)
  const [row] = await app.db
    .select({ is_primary: user_wallets.is_primary })
    .from(user_wallets)
    .where(and(eq(user_wallets.user_id, u.row.id), eq(user_wallets.address, mixed)))
  assert.strictEqual(row?.is_primary, true)
})

// ---------- one main wallet PER CHAIN (#42) ---------------------------------------

test('choosing an EVM main wallet does NOT un-choose the Solana one', { skip }, async () => {
  // The behaviour change. The marker used to be account-wide, so this endpoint
  // cleared EVERY primary the user had — picking a wallet on one chain silently
  // dropped their choice on every other, which the body's own `chain_ns` field
  // already implied it would not.
  const app = getApp()
  const u = await createUser(app)
  const solana = await linkWallet(app, u.row.id, { is_primary: true })
  const evm = testEvmAddress()
  await app.db
    .insert(user_wallets)
    .values({ chain_ns: 'eip155', address: evm, user_id: u.row.id, is_primary: false })

  const res = await app.inject({
    method: 'POST', url: '/v1/auth/set-primary-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'eip155', address: evm },
  })
  assert.strictEqual(res.statusCode, 200)

  const rows = await app.db
    .select({ chain_ns: user_wallets.chain_ns, address: user_wallets.address, is_primary: user_wallets.is_primary })
    .from(user_wallets)
    .where(eq(user_wallets.user_id, u.row.id))
  const primaries = rows.filter((r) => r.is_primary)
  assert.strictEqual(primaries.length, 2, 'a user may hold one main wallet per chain family')
  assert.deepStrictEqual(
    primaries.map((r) => `${r.chain_ns}:${r.address}`).sort(),
    [`eip155:${evm}`, `solana:${solana.address}`].sort(),
  )
})

test('choosing a second main wallet on the SAME chain displaces the first', { skip }, async () => {
  // The half that must NOT change: within one family the marker is still
  // exclusive, so "which wallet do I transact with on this chain" keeps exactly
  // one answer.
  const app = getApp()
  const u = await createUser(app)
  const first = await linkWallet(app, u.row.id, { is_primary: true })
  const second = await linkWallet(app, u.row.id, { is_primary: false })

  const res = await app.inject({
    method: 'POST', url: '/v1/auth/set-primary-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'solana', address: second.address },
  })
  assert.strictEqual(res.statusCode, 200)

  const rows = await app.db
    .select({ address: user_wallets.address, is_primary: user_wallets.is_primary })
    .from(user_wallets)
    .where(and(eq(user_wallets.user_id, u.row.id), eq(user_wallets.chain_ns, 'solana')))
  assert.deepStrictEqual(
    rows.filter((r) => r.is_primary).map((r) => r.address),
    [second.address],
  )
  assert.strictEqual(rows.find((r) => r.address === first.address)?.is_primary, false)
})

test('the DATABASE refuses two main wallets on one chain, not just the route', { skip }, async () => {
  // The route swaps in a transaction, but the guarantee is the partial unique
  // index — without it, any other writer (a migration, a script, a future
  // endpoint) could leave two, and every resolver would then pick arbitrarily
  // between them.
  const app = getApp()
  const u = await createUser(app)
  await linkWallet(app, u.row.id, { is_primary: true })
  await assert.rejects(() => linkWallet(app, u.row.id, { is_primary: true }))
})

test('a main wallet on each family is accepted by that same index', { skip }, async () => {
  // The control: the index must be per (user_id, chain_ns), so this INSERT —
  // which the old account-wide index rejected — now succeeds.
  const app = getApp()
  const u = await createUser(app)
  await linkWallet(app, u.row.id, { is_primary: true })
  await assert.doesNotReject(() =>
    app.db.insert(user_wallets).values({
      chain_ns: 'eip155',
      address: testEvmAddress(),
      user_id: u.row.id,
      is_primary: true,
    }),
  )
})
