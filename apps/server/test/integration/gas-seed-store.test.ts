/**
 * `drizzleGasSeedStore` against a real database — specifically WHICH wallet a
 * seed is paid to.
 *
 * A user may hold several wallets on one namespace (`user_wallets`' primary key
 * is (chain_ns, address), and only ONE row per user carries is_primary), and
 * every transaction the server builds for them resolves through
 * `resolvePrimaryWalletAddress` — whose own comment says two copies of that
 * query is how the recorded wallet and the baked wallet drift apart. The seed
 * store had the second copy, minus the ordering.
 *
 * That mattered little while Solana was the only seedable namespace and most
 * users had one wallet. #53a makes every EVM chain seedable, where holding both
 * an injected and a WalletConnect wallet is ordinary — and the grant is
 * ONE-SHOT: `gas_grants` is keyed (user_id, chain_id), so gas paid to the wallet
 * the user does not sign with is gas they never get.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { chains } from '@tenda/shared/db/schema/chains'
import { user_wallets } from '@tenda/shared/db/schema/identity'
import { gas_grants } from '@tenda/shared/db/schema/gas-seed'
import { drizzleGasSeedStore } from '@server/features/gas-seed'
import { resolvePrimaryWalletAddress } from '@server/lib/auth/resolver'
import { TEST_DB_CONFIGURED, useTestApp, createUser } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

let seq = 0
function evmAddress(): `0x${string}` {
  seq += 1
  return `0x${seq.toString(16).padStart(40, '0')}`
}

test('the seed is paid to the wallet the tx builders sign with, not an arbitrary one', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const secondary = evmAddress()
  const primary = evmAddress()

  // Non-primary inserted FIRST: an unordered `limit(1)` returns it.
  await app.db.insert(user_wallets).values([
    { chain_ns: 'eip155', address: secondary, user_id: user.row.id, is_primary: false },
    { chain_ns: 'eip155', address: primary, user_id: user.row.id, is_primary: true },
  ])

  const paid = await drizzleGasSeedStore(app.db).findWalletAddress(user.row.id, 'eip155')
  assert.strictEqual(paid, primary)
  // And it must AGREE with the builders' resolver, not merely happen to match:
  // one rule, one place.
  assert.strictEqual(paid, await resolvePrimaryWalletAddress(app.db, user.row.id, 'eip155'))
})

test('a namespace the user has no wallet on yields null, never another chain\'s wallet', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  await app.db
    .insert(user_wallets)
    .values({ chain_ns: 'eip155', address: evmAddress(), user_id: user.row.id, is_primary: true })

  const store = drizzleGasSeedStore(app.db)
  assert.strictEqual(await store.findWalletAddress(user.row.id, 'solana'), null)
  assert.notStrictEqual(await store.findWalletAddress(user.row.id, 'eip155'), null)
})

test('a user with no wallets at all yields null', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  assert.strictEqual(
    await drizzleGasSeedStore(app.db).findWalletAddress(user.row.id, 'eip155'),
    null,
  )
})

test('one user\'s wallets are never offered to another', { skip }, async () => {
  const app = getApp()
  const owner = await createUser(app)
  const stranger = await createUser(app)
  await app.db
    .insert(user_wallets)
    .values({ chain_ns: 'eip155', address: evmAddress(), user_id: owner.row.id, is_primary: true })

  assert.strictEqual(
    await drizzleGasSeedStore(app.db).findWalletAddress(stranger.row.id, 'eip155'),
    null,
  )
})

// ---------- the claim/finalize/release cycle, against postgres ---------------
//
// The unit suites drive the claim jobs through a hand-written store, so they
// prove the ORCHESTRATION and nothing about the SQL. Idempotency is the part
// that cannot be taken on trust: the "never double-pay" property is a PRIMARY
// KEY conflict, and a fake that returns false on a second call demonstrates
// only that the fake was written that way.

/**
 * 0G mainnet — a real manifest chain the harness does not seed itself.
 *
 * A plain insert, with no conflict handling, on purpose: `resetDb` TRUNCATEs
 * every public table in the harness's `beforeEach` and re-seeds one chain, so
 * every test starts without this row. A test that leaves it disabled or dormant
 * (findSeedableChains, below) therefore cannot affect the next one, and an
 * upsert here would be a branch nothing can reach — verified by deleting the
 * clause and watching all eight cases still pass.
 */
const SEEDABLE_CHAIN = 'eip155:16661'
const SEED_AMOUNT = '10000000000000000'

async function withSeedableChain(app: ReturnType<typeof getApp>): Promise<void> {
  await app.db
    .insert(chains)
    .values({
      id: SEEDABLE_CHAIN,
      namespace: 'eip155',
      display_name: '0G',
      min_confirmations: 2,
      treasury_address: evmAddress(),
      escrow_program: evmAddress(),
      gas_seed_amount_raw: SEED_AMOUNT,
      gas_seed_wallet_address: evmAddress(),
    })
}

test('findSeedableChains returns enabled chains carrying an amount, and only those', { skip }, async () => {
  const app = getApp()
  await withSeedableChain(app)
  const store = drizzleGasSeedStore(app.db)

  const seedable = await store.findSeedableChains()
  const ours = seedable.find((c) => c.chain_id === SEEDABLE_CHAIN)
  assert.ok(ours, 'a chain with a non-null amount must be offered')
  // The exact decimal STRING, which is also the driver check: numeric(78,0) at
  // 1e16 must not come back in exponent notation, because the sender parses it
  // with BigInt() and '1e+16' throws there. Asserting the literal catches that;
  // a separate `doesNotThrow(() => BigInt(...))` could only fail if this line
  // already had.
  assert.deepStrictEqual(ours, {
    chain_id: SEEDABLE_CHAIN,
    namespace: 'eip155',
    gas_seed_amount_raw: SEED_AMOUNT,
  })

  // Disabled → gone. This is the switch an operator uses to stop paying seeds
  // on a chain without unsetting the key or re-seeding.
  await app.db.update(chains).set({ is_enabled: false }).where(eq(chains.id, SEEDABLE_CHAIN))
  assert.strictEqual(
    (await store.findSeedableChains()).some((c) => c.chain_id === SEEDABLE_CHAIN),
    false,
  )

  // Dormant (both columns NULL, as the paired CHECK requires) → also gone.
  await app.db
    .update(chains)
    .set({ is_enabled: true, gas_seed_amount_raw: null, gas_seed_wallet_address: null })
    .where(eq(chains.id, SEEDABLE_CHAIN))
  assert.strictEqual(
    (await store.findSeedableChains()).some((c) => c.chain_id === SEEDABLE_CHAIN),
    false,
  )
})

test('claimGrant is won ONCE — the second caller is refused by the database itself', { skip }, async () => {
  const app = getApp()
  await withSeedableChain(app)
  const user = await createUser(app)
  const store = drizzleGasSeedStore(app.db)
  const row = {
    user_id: user.row.id,
    chain_id: SEEDABLE_CHAIN,
    amount_raw: SEED_AMOUNT,
    tx_ref: `pending:${user.row.id}:${SEEDABLE_CHAIN}`,
  }

  assert.strictEqual(await store.claimGrant(row), true)
  assert.strictEqual(await store.claimGrant(row), false, 'the PK conflict must refuse the retry')

  // …and the loser must not have overwritten the winner's row.
  const held = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(held.length, 1)
  assert.strictEqual(held[0]?.tx_ref, row.tx_ref)
})

test('the lifecycle against a real table: claimed → submitted → delivered', { skip }, async () => {
  const app = getApp()
  await withSeedableChain(app)
  const user = await createUser(app)
  const store = drizzleGasSeedStore(app.db)
  const claim = { user_id: user.row.id, chain_id: SEEDABLE_CHAIN, amount_raw: SEED_AMOUNT }

  // A fresh claim holds the slot with NO reference — nothing has been signed.
  assert.strictEqual(await store.claimGrant(claim), true)
  const [fresh] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(fresh?.status, 'claimed')
  assert.strictEqual(fresh?.tx_ref, null, 'a claimed slot names no transaction')
  assert.strictEqual(fresh?.submitted_at, null)

  const txRef = `0x${'ab'.repeat(32)}`
  const at = new Date()
  assert.strictEqual(await store.markSubmitted({ ...claim, tx_ref: txRef, submitted_at: at }), true)
  const [submitted] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(submitted?.status, 'submitted')
  assert.strictEqual(submitted?.tx_ref, txRef)
  assert.strictEqual(submitted?.submitted_at?.getTime(), at.getTime())
  assert.strictEqual(submitted?.amount_raw, SEED_AMOUNT)

  await store.markDelivered(user.row.id, SEEDABLE_CHAIN)
  const [delivered] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(delivered?.status, 'delivered')
  assert.strictEqual(delivered?.tx_ref, txRef, 'delivering must not disturb the reference')
})

test('markSubmitted is status-guarded: only a CLAIMED slot accepts a reference', { skip }, async () => {
  // The guard that stops a redelivered broadcast job from replacing the hash of
  // a transfer already in flight — which would leave the first transfer live and
  // unattributable while the row pointed at a second one.
  const app = getApp()
  await withSeedableChain(app)
  const user = await createUser(app)
  const store = drizzleGasSeedStore(app.db)
  const claim = { user_id: user.row.id, chain_id: SEEDABLE_CHAIN, amount_raw: SEED_AMOUNT }
  await store.claimGrant(claim)

  const first = `0x${'11'.repeat(32)}`
  assert.strictEqual(await store.markSubmitted({ ...claim, tx_ref: first, submitted_at: new Date() }), true)

  const second = `0x${'22'.repeat(32)}`
  assert.strictEqual(
    await store.markSubmitted({ ...claim, tx_ref: second, submitted_at: new Date() }),
    false,
    'a second attempt must be refused, not silently overwrite',
  )
  const [row] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(row?.tx_ref, first, 'the first transfer keeps the slot')
})

test('markUnresolved holds the slot; only a chain-attested failure releases it', { skip }, async () => {
  const app = getApp()
  await withSeedableChain(app)
  const user = await createUser(app)
  const store = drizzleGasSeedStore(app.db)
  const claim = { user_id: user.row.id, chain_id: SEEDABLE_CHAIN, amount_raw: SEED_AMOUNT }
  await store.claimGrant(claim)
  await store.markSubmitted({ ...claim, tx_ref: `0x${'cd'.repeat(32)}`, submitted_at: new Date() })

  await store.markUnresolved(user.row.id, SEEDABLE_CHAIN)
  const [row] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(row?.status, 'unresolved')
  assert.strictEqual(
    await store.claimGrant(claim),
    false,
    'an unresolved grant must NOT be re-claimable — the money may have moved',
  )

  // Release is what makes a chain-attested failure retryable rather than permanent.
  await store.releaseGrant(user.row.id, SEEDABLE_CHAIN)
  assert.deepStrictEqual(
    await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id)),
    [],
  )
  assert.strictEqual(await store.claimGrant(claim), true, 'the slot must be claimable again')
})

test('markDelivered refuses a slot that was never signed', { skip }, async () => {
  // Defence in depth against the worst outcome this feature has: a user stamped
  // as paid for a transfer nobody ever made. No caller can reach it today — the
  // confirm job only acts on `submitted` — but the (user_id, chain_id) key makes
  // the mistake permanent, so the write refuses it rather than trusting callers.
  const app = getApp()
  await withSeedableChain(app)
  const user = await createUser(app)
  const store = drizzleGasSeedStore(app.db)
  await store.claimGrant({ user_id: user.row.id, chain_id: SEEDABLE_CHAIN, amount_raw: SEED_AMOUNT })

  await store.markDelivered(user.row.id, SEEDABLE_CHAIN)

  const [row] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(row?.status, 'claimed', 'a claimed slot must not become delivered')
  assert.strictEqual(row?.tx_ref, null)
})

test('markUnresolved cannot pull a DELIVERED grant back into doubt', { skip }, async () => {
  // A confirmation racing a delivery must not un-stamp it. The guard is on the
  // status, so the late writer finds nothing to update.
  const app = getApp()
  await withSeedableChain(app)
  const user = await createUser(app)
  const store = drizzleGasSeedStore(app.db)
  const claim = { user_id: user.row.id, chain_id: SEEDABLE_CHAIN, amount_raw: SEED_AMOUNT }
  await store.claimGrant(claim)
  await store.markSubmitted({ ...claim, tx_ref: `0x${'ef'.repeat(32)}`, submitted_at: new Date() })
  await store.markDelivered(user.row.id, SEEDABLE_CHAIN)

  await store.markUnresolved(user.row.id, SEEDABLE_CHAIN)
  const [row] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(row?.status, 'delivered')
})

test('a user mid-transfer does not block everyone else\'s seed on that chain', { skip }, async () => {
  // The property that replaced the derived `pending:<user>:<chain>` placeholder.
  // `gas_grants.tx_ref` is UNIQUE, and a claimed slot now stores NULL there —
  // Postgres treats NULLs as distinct in a unique index, so any number of users
  // can hold unbroadcast claims at once. A constant placeholder string would
  // have made the second claimant a duplicate-key violation, denied a seed by
  // someone else's timing.
  //
  // The unit suite cannot see this at all: its store fake has no uniqueness.
  const app = getApp()
  await withSeedableChain(app)
  const store = drizzleGasSeedStore(app.db)
  const a = await createUser(app)
  const b = await createUser(app)

  assert.strictEqual(
    await store.claimGrant({ user_id: a.row.id, chain_id: SEEDABLE_CHAIN, amount_raw: SEED_AMOUNT }),
    true,
  )
  assert.strictEqual(
    await store.claimGrant({ user_id: b.row.id, chain_id: SEEDABLE_CHAIN, amount_raw: SEED_AMOUNT }),
    true,
    'B was denied while A held an unbroadcast claim',
  )
})

test('the UNIQUE reference still stops one transaction being stamped onto two grants', { skip }, async () => {
  // The last line of defence, and it survives the column becoming nullable.
  const app = getApp()
  await withSeedableChain(app)
  const store = drizzleGasSeedStore(app.db)
  const a = await createUser(app)
  const b = await createUser(app)
  const shared = `0x${'99'.repeat(32)}`
  const at = new Date()

  await store.claimGrant({ user_id: a.row.id, chain_id: SEEDABLE_CHAIN, amount_raw: SEED_AMOUNT })
  await store.claimGrant({ user_id: b.row.id, chain_id: SEEDABLE_CHAIN, amount_raw: SEED_AMOUNT })
  await store.markSubmitted({ user_id: a.row.id, chain_id: SEEDABLE_CHAIN, tx_ref: shared, submitted_at: at })

  // Matched on the CONSTRAINT NAME, not merely on "something threw". A bare
  // string second argument is `assert.rejects`'s message parameter, so it
  // accepts any rejection — including one from the status guard — and the test
  // would stay green while the uniqueness it exists for was gone.
  //
  // The name is on the CAUSE: drizzle wraps the driver error, so its own message
  // is just "Failed query: update ...". Reading through to the cause is what
  // makes this assertion about the unique index rather than about any failure.
  await assert.rejects(
    () => store.markSubmitted({ user_id: b.row.id, chain_id: SEEDABLE_CHAIN, tx_ref: shared, submitted_at: at }),
    (err: unknown) => {
      assert.ok(err instanceof Error, 'expected an Error')
      assert.match(String(err.cause), /gas_grants_tx_ref_uq/)
      return true
    },
    'two grants must never share one on-chain reference',
  )
})
