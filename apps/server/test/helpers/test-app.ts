/**
 * HTTP integration harness (CO2): a real Fastify app — real db/auth/queue
 * plugins, real autoloaded routes, the production error envelope — with
 * ONE substitution: a fake chain registry, so no test ever depends on
 * devnet RPC.
 *
 * GATED on TEST_DATABASE_URL (a dedicated database, e.g. tenda_test):
 *
 *   TEST_DATABASE_URL=postgresql://...:5432/tenda_test pnpm test
 *
 * Migrations run once per process via the drizzle programmatic migrator;
 * `resetDb()` truncates every public table between tests (the migrator's
 * bookkeeping lives in the `drizzle` schema and survives).
 */

// Env stubs BEFORE any config-reading import (CJS: imports execute in order).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://unused/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.SOLANA_RPC_URL ??= 'http://127.0.0.1:8899'
process.env.SOLANA_TREASURY_ADDRESS ??= '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1'
process.env.SOLANA_PROGRAM_ID ??= '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'
process.env.API_BASE_URL ??= 'https://api.tenda.test'
delete process.env.REDIS_URL // queue stays the 501 stub — no Redis dependency

import { join } from 'node:path'
import { before, after, beforeEach } from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import AutoLoad from '@fastify/autoload'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { users, user_wallets, user_identities, escrows, gig_details, exchange_details, chains, assets, platform_config } from '@tenda/shared/db/schema'
import { fiat_providers, bank_accounts } from '@tenda/shared/db/schema/fiat'
import type { ProofType } from '@tenda/shared'
import { registerErrorHandlers } from '@server/lib/http-errors'
import { invalidateFeaturedCache } from '@server/lib/featured'
import { invalidateExchangeRatesCache } from '@server/lib/exchange-rates'
import { invalidatePlatformConfigCache } from '@server/lib/platform'
import { PAYOUT_CURRENCIES } from '@tenda/shared'
import dbPlugin from '@server/plugins/db'
import authPlugin from '@server/plugins/auth'
import queuePlugin from '@server/plugins/queue'
import websocketPlugin from '@server/plugins/websocket'
import { inMemoryQuoteCache } from '@server/features/fiat-rails/quote-cache'
import type { ChainAdapter, ChainRegistry, UnsignedTx } from '@server/chains/types'
import { buildContractRegistry } from '@server/chains/contracts'
import { userFixture, escrowFixture, type UserRow, type EscrowRow } from './fixtures'

export const TEST_DB_CONFIGURED = process.env.TEST_DATABASE_URL !== undefined

/**
 * Chain/asset every harness escrow rides on (re-seeded by `resetDb`).
 * USDC_SOL is the gig-eligible asset for solana:devnet (assertGigAsset).
 */
export const TEST_CHAIN_ID = 'solana:devnet'
export const TEST_ASSET = 'USDC_SOL'
export const TEST_NATIVE_ASSET = 'SOL_DEVNET'

/**
 * A SECOND registered chain, so cross-chain behaviour (the `chain_id` list
 * filter) can be proven to discriminate rather than just "not crash".
 * Registered in the fake registry always — a registered-but-unseeded chain
 * is exactly the state that must return an EMPTY page rather than a 400.
 * Its DB rows are opt-in via `seedAltChain`, keeping the single-chain
 * expectations of the DB-driven suites (e.g. platform-chains) untouched.
 */
export const TEST_CHAIN_ID_ALT = 'eip155:84532'
export const TEST_ASSET_ALT = 'USDC_BASE'

/** A well-formed CAIP-2 id that is NOT in the registry — the 400 path. */
export const UNREGISTERED_CHAIN_ID = 'solana:mainnet'

/** Stable dummy unsigned tx — routes only relay it, never decode it. */
export const FAKE_UNSIGNED: UnsignedTx = {
  kind: 'solana-tx',
  tx_base64: Buffer.from('fake-tx').toString('base64'),
  recent_blockhash: 'FakeBlockhash1111111111111111111111111111111',
  last_valid_block_height: 1,
}

/**
 * Signature value the fake adapter treats as INVALID — lets wallet-auth
 * tests exercise the 401 path deterministically (every other signature
 * string verifies). Exported so tests reference the sentinel, not a literal.
 */
export const FAKE_BAD_SIGNATURE = 'sig:invalid'

/** Fake chain's configured dispute-resolution authority (a valid base58). */
export const FAKE_DISPUTE_AUTHORITY = '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1'
/** What the fake adapters report as their escrow program/contract. */
export const FAKE_SOLANA_PROGRAM = process.env.SOLANA_PROGRAM_ID ?? ''
export const FAKE_EVM_ESCROW = `0x${'f1'.repeat(20)}`

function fakeAdapter(chain_id: string, namespace: 'solana' | 'eip155' = 'solana'): ChainAdapter {
  const unimplemented = (op: string) => () => {
    throw new Error(`fake adapter: ${op} not used by HTTP routes under test`)
  }
  return {
    namespace,
    chain_id,
    // Stand-in dispute authority so resolve-tx builds under test (the real
    // value rides each chain's secret).
    disputeAuthority: FAKE_DISPUTE_AUTHORITY,
    // What /v1/platform/chains serves as `escrow_address`. On the adapter
    // because that is the contract the server actually transacts with — the
    // seeded `chains.escrow_program` column is no longer the source.
    escrowAddress: namespace === 'solana' ? FAKE_SOLANA_PROGRAM : FAKE_EVM_ESCROW,
    buildTx: async () => FAKE_UNSIGNED,
    verifyTx: unimplemented('verifyTx'),
    // Offline stand-in for tweetnacl/viem sig verify: any signature passes
    // except the explicit bad sentinel (the wallet-auth 401 path).
    verifyAuthSig: async ({ signature }) => signature !== FAKE_BAD_SIGNATURE,
    fetchEscrowState: unimplemented('fetchEscrowState'),
    computeFee: unimplemented('computeFee'),
  }
}

function fakeRegistry(): ChainRegistry {
  // Solana FIRST: `reconcile-escrows` falls back to `list()[0]` and the
  // helius webhook / listeners plugin pick the first solana adapter, so
  // insertion order is load-bearing — the alt chain must never displace it.
  const adapters = new Map<string, ChainAdapter>([
    [TEST_CHAIN_ID, fakeAdapter(TEST_CHAIN_ID)],
    [TEST_CHAIN_ID_ALT, fakeAdapter(TEST_CHAIN_ID_ALT, 'eip155')],
  ])
  return {
    get(chain_id) {
      const a = adapters.get(chain_id)
      if (a === undefined) throw new Error(`no adapter registered for chain_id '${chain_id}'`)
      return a
    },
    has: (chain_id) => adapters.has(chain_id),
    list: () => [...adapters.values()],
    // Offline stand-in for tweetnacl/viem sig verify (namespace-dispatched, like
    // the real registry): any signature passes except the explicit bad sentinel
    // (the wallet-auth 401 path). Works for unprovisioned chains too.
    verifyAuthSig: async (_chain_id, { signature }) => signature !== FAKE_BAD_SIGNATURE,
  }
}

let migrated = false

/** Bring the test DB to head over a dedicated quiet connection. */
async function migrateOnce(): Promise<void> {
  if (migrated) return
  const client = postgres(process.env.DATABASE_URL as string, { max: 1, onnotice: () => {} })
  await migrate(drizzle(client), {
    migrationsFolder: join(__dirname, '..', '..', 'src', 'db', 'migrations'),
  })
  await client.end()
  migrated = true
}

export async function buildTestApp(): Promise<FastifyInstance> {
  await migrateOnce()

  const app = Fastify({ logger: false })
  registerErrorHandlers(app)

  await app.register(dbPlugin)
  await app.register(authPlugin)
  await app.register(queuePlugin)
  await app.register(websocketPlugin)
  const chains = fakeRegistry()
  app.decorate('chains', chains)
  // Built from the SAME adapters, through the production builder, so the
  // contract each escrow resolves to cannot disagree with the one the fake
  // adapter would transact with. No stored history rows: one contract per
  // chain, which is what makes an unstamped escrow resolve to it rather than
  // being refused as ambiguous (chains/contracts/resolve.ts).
  app.decorate('contracts', buildContractRegistry(chains.list(), []))
  // The plugins dir isn't autoloaded here, so the quote-cache plugin never
  // runs — decorate the behaviourally-identical in-memory cache so fiat quote
  // + initiate exercise the real path (no Redis dependency in tests).
  app.decorate('quoteCache', inMemoryQuoteCache())

  await app.register(AutoLoad, {
    dir: join(__dirname, '..', '..', 'src', 'routes'),
    routeParams: true,
  })
  await app.ready()
  return app
}

/**
 * Suites run in sibling processes (node --test = one process per file,
 * concurrent) but share ONE test database — a session-scoped advisory lock
 * held for the file's whole run serializes them. Unit suites are untouched.
 */
const SUITE_LOCK_KEY = 813_370

/** Open a dedicated connection and hold the cross-process suite lock on it. */
async function acquireSuiteLock(): Promise<postgres.Sql> {
  const lock = postgres(process.env.DATABASE_URL as string, { max: 1, onnotice: () => {} })
  await lock`SELECT pg_advisory_lock(${SUITE_LOCK_KEY})`
  return lock
}

async function releaseSuiteLock(lock: postgres.Sql): Promise<void> {
  await lock`SELECT pg_advisory_unlock(${SUITE_LOCK_KEY})`
  await lock.end()
}

/**
 * Take the cross-process suite lock for a file that talks to the shared test
 * DB WITHOUT the full app harness (seed/registry tests). Without it a sibling
 * suite's `resetDb` TRUNCATE can wipe the registry rows mid-test. Pair with
 * `{ skip: !TEST_DB_CONFIGURED }`.
 */
export function useSuiteLock(): void {
  let lock: postgres.Sql | null = null
  before(async () => {
    if (!TEST_DB_CONFIGURED) return
    lock = await acquireSuiteLock()
  })
  after(async () => {
    if (lock !== null) await releaseSuiteLock(lock)
  })
}

/**
 * Per-suite boilerplate: takes the cross-process suite lock, boots the app
 * once, resets the DB before every test, releases on exit. Returns a getter
 * (the instance doesn't exist until the before hook runs). Pair with
 * `{ skip: !TEST_DB_CONFIGURED }` on each test.
 */
export function useTestApp(): () => FastifyInstance {
  let app: FastifyInstance
  let lock: postgres.Sql | null = null
  before(async () => {
    if (!TEST_DB_CONFIGURED) return
    lock = await acquireSuiteLock()
    app = await buildTestApp()
  })
  after(async () => {
    if (!TEST_DB_CONFIGURED) return
    // `app` is undefined when before() failed — don't mask the root error.
    if (app !== undefined) await app.close()
    if (lock !== null) await releaseSuiteLock(lock)
  })
  beforeEach(async () => {
    if (!TEST_DB_CONFIGURED) return
    await resetDb(app)
  })
  return () => app
}

/**
 * Truncate every public table (migrator bookkeeping lives in the `drizzle`
 * schema and survives), then re-seed the chain/asset rows escrow inserts
 * FK-reference. Call in beforeEach.
 */
export async function resetDb(app: FastifyInstance): Promise<void> {
  const tables = await app.db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  )
  if (tables.length > 0) {
    const list = tables.map((t) => `"${t.tablename}"`).join(', ')
    await app.db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`))
  }
  // Always-available fallback provider — fiat_intents.provider FKs it. The
  // `capabilities` column here is descriptive only: routing reads the LIVE
  // in-memory capabilities that buildProviders() derives from the manifest
  // (PAYOUT_CURRENCIES + exchange assets), never this row.
  await app.db.insert(fiat_providers).values({
    id: 'p2p_internal',
    display_name: 'Tenda P2P',
    capabilities: { onramp: true, offramp: true, currencies: PAYOUT_CURRENCIES, assets: ['*'] },
    priority: 100,
    is_enabled: true,
  })
  // In-process caches survive a TRUNCATE — drop them so a warmed rail
  // (or a stubbed exchange rate) never leaks into the next test.
  invalidateFeaturedCache()
  invalidateExchangeRatesCache()
  // platform_config is cached for 5 minutes, so a test that PATCHes it would
  // otherwise keep serving its value to every later test in the file even
  // though the row itself was just truncated. Load-bearing since the capacity
  // cap reads max_pending_gigs and grace_period_seconds through this cache.
  invalidatePlatformConfigCache()
  await app.db.insert(chains).values({
    id: TEST_CHAIN_ID,
    namespace: 'solana',
    display_name: 'Solana Devnet',
    min_confirmations: 1,
    treasury_address: process.env.SOLANA_TREASURY_ADDRESS ?? '',
    escrow_program: process.env.SOLANA_PROGRAM_ID ?? '',
  })
  await app.db.insert(assets).values([
    {
      id: TEST_ASSET,
      chain_id: TEST_CHAIN_ID,
      symbol: 'USDC',
      decimals: 6,
      token_address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // devnet USDC mint
      is_stable: true,
    },
    // Native asset — the p2p exchange (CO4) trades SOL_DEVNET.
    {
      id: TEST_NATIVE_ASSET,
      chain_id: TEST_CHAIN_ID,
      symbol: 'SOL',
      decimals: 9,
      token_address: null,
      is_stable: false,
    },
  ])
}

/**
 * Opt-in second chain + asset, for tests that need escrows on TWO chains
 * (the `chain_id` list filter). Deliberately NOT part of `resetDb`: the
 * DB-driven chain surfaces (`GET /v1/platform/chains`) assert a single
 * enabled chain, and silently doubling that would be a drive-by change to
 * unrelated expectations. Call it explicitly, after `resetDb` has run.
 */
export async function seedAltChain(app: FastifyInstance): Promise<void> {
  await app.db.insert(chains).values({
    id: TEST_CHAIN_ID_ALT,
    namespace: 'eip155',
    display_name: 'Base Sepolia',
    min_confirmations: 1,
    treasury_address: '',
    escrow_program: '',
  })
  await app.db.insert(assets).values({
    id: TEST_ASSET_ALT,
    chain_id: TEST_CHAIN_ID_ALT,
    symbol: 'USDC',
    decimals: 6,
    token_address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
    is_stable: true,
  })
}

// ---------- fixtures (DB-backed; object shapes come from ./fixtures) -------

export interface TestUser {
  row: UserRow
  token: string
}

export async function createUser(
  app: FastifyInstance,
  overrides: Partial<UserRow> = {},
): Promise<TestUser> {
  const row = userFixture(overrides)
  await app.db.insert(users).values(row)
  return { row, token: app.jwt.sign({ id: row.id, role: row.role }) }
}

/**
 * Link a Solana wallet (matches TEST_CHAIN_ID's namespace) + a verified email
 * to a user so they clear the Stage-9D first-transaction gate
 * (`assertCanTransact`). The wallet address is derived from the user id so it
 * stays unique under the (chain_ns, address) constraint across many users.
 */
/**
 * The Solana address `makeTransactable` links for a user. Exported so tests
 * that need to speak as that wallet (decoded on-chain events name wallets, not
 * user ids) derive it from ONE place rather than re-deriving the format.
 */
export function testWalletAddress(userId: string): string {
  return `SoTx${userId.replace(/-/g, '')}`
}

export async function makeTransactable(app: FastifyInstance, userId: string): Promise<void> {
  await app.db.insert(user_wallets).values({
    chain_ns: 'solana',
    address: testWalletAddress(userId),
    user_id: userId,
    is_primary: true,
    verified_at: new Date(),
  })
  await app.db.insert(user_identities).values({
    user_id: userId,
    kind: 'email',
    identifier: `tx-${userId}@example.com`,
    email: `tx-${userId}@example.com`,
    verified_at: new Date(),
  })
}

/**
 * Insert an escrow on the harness chain/asset. accept_deadline defaults to
 * now+24h (the fixture's fixed date is fine for pure object tests but HTTP
 * listing filters compare against the real clock).
 */
/**
 * Set platform tunables mid-test AND drop the config cache.
 *
 * `getPlatformConfig` caches for five minutes, so writing the row directly is
 * only picked up while nothing has read config yet in this process. That holds
 * today but silently depends on test ORDERING — one added step that reads
 * config and the retune becomes invisible. Going through here makes the
 * dependency explicit instead of accidental.
 */
export async function setPlatformConfig(
  app: FastifyInstance,
  patch: Partial<typeof platform_config.$inferInsert>,
): Promise<void> {
  await app.db.insert(platform_config).values({ id: 1, ...patch }).onConflictDoUpdate({
    target: platform_config.id,
    set: patch,
  })
  invalidatePlatformConfigCache()
}

export async function createEscrow(
  app: FastifyInstance,
  overrides: Partial<EscrowRow> & { creator_id: string },
): Promise<EscrowRow> {
  const row = escrowFixture({
    chain_id: TEST_CHAIN_ID,
    asset: TEST_ASSET,
    accept_deadline: new Date(Date.now() + 86_400_000),
    ...overrides,
  })
  await app.db.insert(escrows).values(row)
  return row
}

export interface GigDetailsOverrides {
  title?: string
  description?: string
  category?: string
  country?: string
  city?: string | null
  remote?: boolean
  cross_border?: boolean
  /** Poster-declared evidence gate; empty (the default) accepts anything. */
  proof_requirements?: ProofType[]
}

export async function attachGigDetails(
  app: FastifyInstance,
  escrow_id: string,
  overrides: GigDetailsOverrides = {},
): Promise<void> {
  await app.db.insert(gig_details).values({
    escrow_id,
    title: 'Test gig',
    description: 'Test description',
    category: 'service',
    country: 'NG',
    city: 'Lagos',
    remote: false,
    cross_border: false,
    ...overrides,
  })
}

export async function attachExchangeDetails(
  app: FastifyInstance,
  escrow_id: string,
  overrides: {
    fiat_amount?: string
    fiat_currency?: string
    rate?: string
    payout_account_id?: string
    /** The buyer's fiat receipt — party-scoped evidence, like escrow_proofs. */
    payment_proof_url?: string
  } = {},
): Promise<void> {
  await app.db.insert(exchange_details).values({
    escrow_id,
    fiat_amount: '15000.0000',
    fiat_currency: 'NGN',
    rate: '1500.0000000000',
    payment_window_seconds: 86_400,
    ...overrides,
  })
}

/** A saved payout account for a user. Country drives the payout currency (NG → NGN). */
export async function createBankAccount(
  app: FastifyInstance,
  user_id: string,
  overrides: Partial<{
    country: string
    kind: 'bank' | 'mobile_money'
    bank_code: string
    account_number: string
    account_name: string
    is_default: boolean
  }> = {},
): Promise<{ id: string }> {
  const [row] = await app.db
    .insert(bank_accounts)
    .values({
      user_id,
      country: 'NG',
      kind: 'bank',
      bank_code: '058',
      account_number: '0123456789',
      account_name: 'Test Seller',
      is_default: true,
      ...overrides,
    })
    .returning({ id: bank_accounts.id })
  return row
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}
