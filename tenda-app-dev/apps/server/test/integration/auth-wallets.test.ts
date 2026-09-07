/**
 * #98 gap-fill — wallet-management auth routes:
 *   POST /v1/auth/unlink-wallet      (3 guards + active-escrow block)
 *   POST /v1/auth/set-primary-wallet (atomic primary swap)
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { and, eq } from 'drizzle-orm'
import { user_wallets, user_identities } from '@tenda/shared/db/schema/identity'
import { AppError } from '@server/lib/errors'
import { unlinkWallet } from '@server/lib/auth/wallet-unlink'
import { walletFixture } from '../helpers/fixtures'
import {
  TEST_DB_CONFIGURED, useTestApp, createUser, createEscrow, authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

let addrSeq = 0
async function link(app: ReturnType<typeof getApp>, user_id: string, over: Partial<ReturnType<typeof walletFixture>> = {}) {
  const w = walletFixture({ user_id, address: `SolWallet${addrSeq++}1111111111111111111111111`, ...over })
  await app.db.insert(user_wallets).values(w)
  return w
}

// ---------- unlink-wallet --------------------------------------------------------

test('unlink-wallet: 422 on an invalid chain_ns', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'bitcoin', address: 'x' },
  })
  assert.strictEqual(res.statusCode, 422)
})

test('unlink-wallet: 422 when address is missing', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'solana' },
  })
  assert.strictEqual(res.statusCode, 422)
})

test('unlink-wallet: 404 when the wallet is not linked', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await link(app, u.row.id) // some other wallet so it is not the "only wallet" path
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'solana', address: 'NotLinkedAddr1111111111111111111111111111' },
  })
  assert.strictEqual(res.statusCode, 404)
})

test('unlink-wallet: 409 LAST_WALLET when it is the only linked wallet', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app) // no identities → the wallet is the sole credential
  const w = await link(app, u.row.id, { is_primary: true })
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: w.chain_ns, address: w.address },
  })
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'LAST_WALLET')
})

test('unlink-wallet: 409 LAST_WALLET even when a verified contact remains', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const w = await link(app, u.row.id, { is_primary: true })
  // A wallet is required to transact, so the account must keep at least one even
  // though a verified email would satisfy the looser sign-in/last-credential rule.
  await app.db.insert(user_identities).values({
    user_id: u.row.id, kind: 'email', identifier: `keep-${u.row.id}@x.io`,
    email: `keep-${u.row.id}@x.io`, verified_at: new Date(),
  })
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: w.chain_ns, address: w.address },
  })
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'LAST_WALLET')
  const left = await app.db.select().from(user_wallets).where(eq(user_wallets.user_id, u.row.id))
  assert.strictEqual(left.length, 1) // the wallet survives the refusal
})

test('unlink-wallet: matches a checksummed EVM address against the lowercased row', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await link(app, u.row.id, { is_primary: true }) // keep a second wallet so this isn't the sole one
  // Stored canonical (lowercase); the client sends the checksummed form back.
  const lower = `0xdef${(addrSeq++).toString(16).padStart(37, '0')}`
  await app.db.insert(user_wallets).values({
    chain_ns: 'eip155', address: lower, user_id: u.row.id, is_primary: false,
  })
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'eip155', address: lower.toUpperCase() },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().unlinked, true)
  const left = await app.db
    .select().from(user_wallets)
    .where(and(eq(user_wallets.user_id, u.row.id), eq(user_wallets.chain_ns, 'eip155')))
  assert.strictEqual(left.length, 0)
})

test('unlink-wallet: a legacy MIXED-CASE EVM row unlinks (the row the app echoes back)', { skip }, async () => {
  // Regression: pre-fix rows are checksummed. The app echoes that exact stored
  // address; normalising only the request → no match → confusing 404. Must work.
  const app = getApp()
  const u = await createUser(app)
  await link(app, u.row.id, { is_primary: true }) // a second wallet so this isn't the sole one
  const mixed = `0xAbC${(addrSeq++).toString(16).padStart(37, '0')}`
  await app.db.insert(user_wallets).values({
    chain_ns: 'eip155', address: mixed, user_id: u.row.id, is_primary: false,
  })
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'eip155', address: mixed }, // exactly what `me` returned
  })
  assert.strictEqual(res.statusCode, 200)
  const left = await app.db
    .select().from(user_wallets)
    .where(and(eq(user_wallets.user_id, u.row.id), eq(user_wallets.chain_ns, 'eip155')))
  assert.strictEqual(left.length, 0)
})

test('unlink-wallet: a SOLE legacy mixed-case EVM wallet → LAST_WALLET (not a 404)', { skip }, async () => {
  // The user-reported case: a single legacy wallet returned 404 "not linked".
  // It must now be correctly recognised and blocked as the only wallet.
  const app = getApp()
  const u = await createUser(app)
  const mixed = `0xAbC${(addrSeq++).toString(16).padStart(37, '0')}`
  await app.db.insert(user_wallets).values({
    chain_ns: 'eip155', address: mixed, user_id: u.row.id, is_primary: true,
  })
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: 'eip155', address: mixed },
  })
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'LAST_WALLET')
})

test('unlink-wallet: 409 cannot unlink the primary while another exists', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const primary = await link(app, u.row.id, { is_primary: true })
  await link(app, u.row.id, { is_primary: false })
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: primary.chain_ns, address: primary.address },
  })
  assert.strictEqual(res.statusCode, 409)
  // Its OWN code — NOT WALLET_IN_USE — so the client doesn't show the escrow copy.
  assert.strictEqual(res.json().code, 'WALLET_IS_PRIMARY')
})

test('unlink-wallet: 409 when the wallet is party to an active escrow', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await link(app, u.row.id, { is_primary: true })
  const target = await link(app, u.row.id, { is_primary: false })
  await createEscrow(app, { creator_id: u.row.id, status: 'open' }) // solana namespace, active
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: target.chain_ns, address: target.address },
  })
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'WALLET_IN_USE') // escrow case keeps this code
  assert.ok(Array.isArray(res.json().details?.escrow_ids))
})

test('unlink-wallet: 200 unlinks a non-primary idle wallet', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await link(app, u.row.id, { is_primary: true })
  const target = await link(app, u.row.id, { is_primary: false })
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/unlink-wallet', headers: authHeader(u.token),
    payload: { chain_ns: target.chain_ns, address: target.address },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().unlinked, true)
})

test('unlink-wallet: concurrent unlinks of two wallets cannot strand the account', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app) // no identities → these wallets are the ONLY credentials
  const w1 = await link(app, u.row.id, { is_primary: false })
  const w2 = await link(app, u.row.id, { is_primary: false })

  // Drive the core directly (the race is at the DB layer, below the route) so
  // the two transactions genuinely run in parallel on the pool — without the
  // per-user advisory lock both read "2 wallets" and both delete → 0 wallets
  // (stranded). With it, the loser sees only its own wallet left and throws.
  const results = await Promise.allSettled([
    unlinkWallet(app.db, { userId: u.row.id, chain_ns: w1.chain_ns, address: w1.address }),
    unlinkWallet(app.db, { userId: u.row.id, chain_ns: w2.chain_ns, address: w2.address }),
  ])

  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')
  assert.strictEqual(fulfilled.length, 1, 'exactly one unlink succeeds')
  assert.strictEqual(rejected.length, 1, 'the other is refused')
  const reason = rejected[0]?.status === 'rejected' ? rejected[0].reason : null
  assert.ok(reason instanceof AppError && reason.code === 'LAST_WALLET')

  // The account is never stranded — exactly one wallet remains.
  const left = await app.db.select().from(user_wallets).where(eq(user_wallets.user_id, u.row.id))
  assert.strictEqual(left.length, 1)
})

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
  await link(app, u.row.id, { is_primary: true })
  const next = await link(app, u.row.id, { is_primary: false })
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
  await link(app, u.row.id, { is_primary: true })
  const mixed = `0xAbC${(addrSeq++).toString(16).padStart(37, '0')}`
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
