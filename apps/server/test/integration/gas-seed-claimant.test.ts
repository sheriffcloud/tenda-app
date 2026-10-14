/**
 * Who the server thinks the claimant is, and WHICH wallet it would pay (#53c-1).
 *
 * Two halves of one question, both needing postgres: `claimantFacts` reads three
 * unrelated tables and every one of its answers gates a payout, while
 * `resolvePrimaryWalletAddress` has to return the SAME wallet twice in a row —
 * a property no in-memory fake can demonstrate, because the thing that used to
 * break it was the database's freedom to pick a row order.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { user_identities, user_wallets, users } from '@tenda/shared/db/schema/identity'
import { gas_grants } from '@tenda/shared/db/schema/gas-seed'
import { device_tokens } from '@tenda/shared/db/schema/messaging'
import { claimGasSeed, drizzleGasSeedClaimStore } from '@server/features/gas-seed'
import { resolvePrimaryWalletAddress } from '@server/lib/auth/resolver'
import { TEST_DB_CONFIGURED, useTestApp, createUser } from '../helpers/test-app'
import { CHAIN, deps, evmAddress, withSeedableChain } from '../helpers/gas-seed-claim-db'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- claimant facts, read from three tables --------------------------------

test('a brand-new account reports no device, no phone, not suspended, not an agent', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const facts = await drizzleGasSeedClaimStore(app.db).claimantFacts(user.row.id)
  assert.deepStrictEqual(facts, {
    client: null,
    has_device_token: false,
    has_verified_phone: false,
    is_suspended: false,
    is_agent: false,
  })
})

test('an UNVERIFIED phone identity does not satisfy the phone gate', { skip }, async () => {
  // `verified_at IS NOT NULL` is the whole gate. A row that merely exists means
  // someone typed a number, which costs nothing and stops no sybil.
  const app = getApp()
  const user = await createUser(app)
  await app.db.insert(user_identities).values({
    user_id: user.row.id,
    kind: 'phone',
    identifier: '+2348000000001',
    verified_at: null,
  })
  const facts = await drizzleGasSeedClaimStore(app.db).claimantFacts(user.row.id)
  assert.strictEqual(facts.has_verified_phone, false)
})

test('a suspended account reads as suspended even with a live token', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  await app.db.update(users).set({ status: 'suspended' }).where(eq(users.id, user.row.id))
  const facts = await drizzleGasSeedClaimStore(app.db).claimantFacts(user.row.id)
  assert.strictEqual(facts.is_suspended, true)
})

test('a user id with no row reads as SUSPENDED, never as eligible', { skip }, async () => {
  // This runs on a payout path: "not found" must never resolve to "go ahead".
  const app = getApp()
  const facts = await drizzleGasSeedClaimStore(app.db).claimantFacts(
    '00000000-0000-4000-8000-000000000000',
  )
  assert.strictEqual(facts.is_suspended, true)
})

test('one user\'s device token does not make ANOTHER user look app-installed', { skip }, async () => {
  const app = getApp()
  const owner = await createUser(app)
  const stranger = await createUser(app)
  await app.db
    .insert(device_tokens)
    .values({ user_id: owner.row.id, token: 'expo-owner-only', platform: 'expo' })

  const store = drizzleGasSeedClaimStore(app.db)
  assert.strictEqual((await store.claimantFacts(owner.row.id)).has_device_token, true)
  assert.strictEqual((await store.claimantFacts(stranger.row.id)).has_device_token, false)
})

// ---------- the deterministic signing wallet (DoD 7) -------------------------------

test('with NO primary on the chain, the wallet resolves to the first linked — stably', { skip }, async () => {
  // Still reachable after #42 made the main wallet per-chain: a user who has
  // linked EVM wallets but never chosen one for that family has no primary
  // there, and the tiebreak is what decides. Before it, this returned whichever
  // row postgres scanned first, free to differ between two calls — which is how
  // a gas seed funds a wallet the user never signs with.
  const app = getApp()
  const user = await createUser(app)
  const older = evmAddress()
  const newer = evmAddress()
  await app.db.insert(user_wallets).values([
    // Inserted newest-first, so a scan-order answer differs from the right one.
    { chain_ns: 'eip155', address: newer, user_id: user.row.id, is_primary: false,
      verified_at: new Date('2026-02-01T00:00:00Z') },
    { chain_ns: 'eip155', address: older, user_id: user.row.id, is_primary: false,
      verified_at: new Date('2026-01-01T00:00:00Z') },
  ])

  const first = await resolvePrimaryWalletAddress(app.db, user.row.id, 'eip155')
  assert.strictEqual(first, older, 'the oldest verified wallet is the stable choice')

  // Repeat reads must agree — that is the property, not the particular value.
  for (let i = 0; i < 5; i += 1) {
    assert.strictEqual(await resolvePrimaryWalletAddress(app.db, user.row.id, 'eip155'), first)
  }
})

test('an explicit primary still WINS over an older sibling', { skip }, async () => {
  // The tiebreak must not have quietly become the whole ordering.
  const app = getApp()
  const user = await createUser(app)
  const oldest = evmAddress()
  const chosen = evmAddress()
  await app.db.insert(user_wallets).values([
    { chain_ns: 'eip155', address: oldest, user_id: user.row.id, is_primary: false,
      verified_at: new Date('2026-01-01T00:00:00Z') },
    { chain_ns: 'eip155', address: chosen, user_id: user.row.id, is_primary: true,
      verified_at: new Date('2026-06-01T00:00:00Z') },
  ])
  assert.strictEqual(await resolvePrimaryWalletAddress(app.db, user.row.id, 'eip155'), chosen)
})

test('two wallets verified in the SAME instant still resolve to one stable answer', { skip }, async () => {
  // A millisecond timestamp is not unique enough to be a sort key by itself —
  // two wallets linked in one transaction share it. The address breaks the tie.
  const app = getApp()
  const user = await createUser(app)
  const at = new Date('2026-03-03T03:03:03.003Z')
  const a = evmAddress()
  const b = evmAddress()
  await app.db.insert(user_wallets).values([
    { chain_ns: 'eip155', address: b, user_id: user.row.id, is_primary: false, verified_at: at },
    { chain_ns: 'eip155', address: a, user_id: user.row.id, is_primary: false, verified_at: at },
  ])
  const expected = [a, b].sort()[0]
  for (let i = 0; i < 5; i += 1) {
    assert.strictEqual(await resolvePrimaryWalletAddress(app.db, user.row.id, 'eip155'), expected)
  }
})

test('the seed pays the SAME wallet the tx builders resolve', { skip }, async () => {
  // The invariant the whole tiebreak exists for, asserted across the two call
  // sites rather than inside one of them.
  const app = getApp()
  await withSeedableChain(app)
  const user = await createUser(app)
  await app.db.insert(user_wallets).values([
    { chain_ns: 'eip155', address: evmAddress(), user_id: user.row.id, is_primary: false,
      verified_at: new Date('2026-05-01T00:00:00Z') },
    { chain_ns: 'eip155', address: evmAddress(), user_id: user.row.id, is_primary: false,
      verified_at: new Date('2026-04-01T00:00:00Z') },
  ])
  await app.db.insert(user_identities).values({
    user_id: user.row.id,
    kind: 'phone',
    identifier: '+2348000000002',
    verified_at: new Date(),
  })
  await app.db
    .insert(device_tokens)
    .values({ user_id: user.row.id, token: 'expo-parity', platform: 'expo' })

  await claimGasSeed(deps(app), { user_id: user.row.id, client: 'mobile' }, CHAIN)
  const [row] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(
    row?.wallet_address,
    await resolvePrimaryWalletAddress(app.db, user.row.id, 'eip155'),
  )
})
