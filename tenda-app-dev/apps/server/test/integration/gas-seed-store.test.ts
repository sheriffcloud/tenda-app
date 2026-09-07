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
import { gas_grants, user_wallets } from '@tenda/shared/db/schema/identity'
import { dispatchGasSeeds, drizzleGasSeedStore, type GasSeedSender } from '@server/features/gas-seed'
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
// The unit suite drives `dispatchGasSeeds` through a hand-written store, so it
// proves the ORCHESTRATION and nothing about the SQL. Idempotency is the part
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

test('finalizeGrant replaces the placeholder; releaseGrant frees the slot for a retry', { skip }, async () => {
  const app = getApp()
  await withSeedableChain(app)
  const user = await createUser(app)
  const store = drizzleGasSeedStore(app.db)
  const claim = {
    user_id: user.row.id,
    chain_id: SEEDABLE_CHAIN,
    amount_raw: SEED_AMOUNT,
    tx_ref: `pending:${user.row.id}:${SEEDABLE_CHAIN}`,
  }
  await store.claimGrant(claim)

  const txRef = `0x${'ab'.repeat(32)}`
  await store.finalizeGrant(user.row.id, SEEDABLE_CHAIN, txRef)
  const [stamped] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id))
  assert.strictEqual(stamped?.tx_ref, txRef, 'a stranded `pending:` ref is a grant that never paid')
  assert.strictEqual(stamped?.amount_raw, SEED_AMOUNT)

  // Release is what makes a failed transfer retryable rather than permanent.
  await store.releaseGrant(user.row.id, SEEDABLE_CHAIN)
  assert.deepStrictEqual(
    await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user.row.id)),
    [],
  )
  assert.strictEqual(await store.claimGrant(claim), true, 'the slot must be claimable again')
})

test('a user mid-transfer does not block everyone else\'s seed on that chain', { skip }, async () => {
  // The placeholder must be unique per SLOT, and this is the only arrangement
  // that can tell: `gas_grants.tx_ref` is UNIQUE, and dispatch replaces the
  // placeholder as soon as the transfer lands — so two sequential users never
  // hold two placeholders at once and a chain-only placeholder passes. The
  // window that matters is a transfer still IN FLIGHT: user A has claimed and
  // not yet finalized while user B arrives. A placeholder derived from
  // anything less than the (user, chain) key makes B's claim a duplicate-key
  // violation, and B is denied a seed by A's timing.
  //
  // The unit suite cannot see this at all: its store fake has no uniqueness.
  const app = getApp()
  await withSeedableChain(app)
  const store = drizzleGasSeedStore(app.db)
  const log = { info() {}, warn() {} }

  async function seedableUser(): Promise<{ id: string; address: string }> {
    const user = await createUser(app)
    const address = evmAddress()
    await app.db
      .insert(user_wallets)
      .values({ chain_ns: 'eip155', address, user_id: user.row.id, is_primary: true })
    return { id: user.row.id, address }
  }

  const inFlight = await seedableUser()
  const arriving = await seedableUser()

  // A's transfer never returns until we let it, so A's placeholder row stays.
  let landA: (result: { tx_ref: string }) => void = () => {}
  let sendEntered: () => void = () => {}
  const sending = new Promise<void>((resolve) => { sendEntered = resolve })
  const hanging: GasSeedSender = {
    send: () => {
      // Entering `send` IS the proof the claim landed — dispatch claims the
      // slot before it calls the sender. Signalling beats polling the table on
      // a timer: a deadline long enough to be reliable is also long enough to
      // make this suite slow, and a time-dependent assertion is exactly the
      // shape #44 was.
      sendEntered()
      return new Promise((resolve) => { landA = resolve })
    },
  }
  const dispatchA = dispatchGasSeeds(
    { store, senders: new Map([[SEEDABLE_CHAIN, hanging]]), log },
    inFlight.id,
  )
  await sending
  assert.ok(await claimed(app, inFlight.id), 'A must be holding an unfinalized placeholder')

  // B arrives while A is still in flight.
  const resultB = await dispatchGasSeeds(
    {
      store,
      senders: new Map([[SEEDABLE_CHAIN, { send: async () => ({ tx_ref: `0x${'bb'.repeat(32)}` }) }]]),
      log,
    },
    arriving.id,
  )
  assert.deepStrictEqual(
    resultB.granted.map((g) => g.chain_id),
    [SEEDABLE_CHAIN],
    `B was denied while A was mid-transfer: ${JSON.stringify(resultB.skipped)}`,
  )

  landA({ tx_ref: `0x${'aa'.repeat(32)}` })
  const resultA = await dispatchA
  assert.strictEqual(resultA.granted.length, 1, 'A completes normally once its transfer lands')
})

/** Does this user hold a grant row whose tx_ref is still the placeholder? */
async function claimed(app: ReturnType<typeof getApp>, user_id: string): Promise<boolean> {
  const rows = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user_id))
  return rows.some((r) => r.tx_ref.startsWith('pending:'))
}
