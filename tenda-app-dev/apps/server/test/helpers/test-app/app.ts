/**
 * App + database lifecycle for the HTTP integration harness (CO2): boot a real
 * Fastify app against a LEASED database, reset it between tests.
 *
 * The database and the migration are `./slot`'s job, not this file's (#49).
 * Both have to happen before `plugins/db` connects, and the boot-time suites
 * need them without ever building an app, so neither can live in
 * `buildTestApp`. What remains here is the app and the reset: `resetDb()`
 * truncates every public table between tests (the migrator's bookkeeping lives
 * in the `drizzle` schema and survives).
 */
// Bare and first, so the stubs are applied before the imports below are
// evaluated. DEFENSIVE, not currently required: measured while splitting this
// file (#44), nothing in this chain reads process.env at module init —
// `config.ts` reads it inside a function — so removing this line breaks
// nothing today. Every read in THIS file (lines below) is call-time too. It is
// kept because the harness's whole job is to stub env before the app sees it,
// and one line is a cheap guard against a future eager read. `fake-chain.ts`
// is the sibling where the same import IS load-bearing, and its note says so.
import './env'
import { join } from 'node:path'
import { before, after, beforeEach } from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import AutoLoad from '@fastify/autoload'
import { sql } from 'drizzle-orm'
import { chains, assets, platform_config } from '@tenda/shared/db/schema'
import { fiat_providers } from '@tenda/shared/db/schema/fiat'
import { PAYOUT_CURRENCIES } from '@tenda/shared'
import { registerErrorHandlers } from '@server/lib/http-errors'
import { invalidateFeaturedCache } from '@server/lib/featured'
import { invalidateExchangeRatesCache } from '@server/lib/exchange-rates'
import { invalidatePlatformConfigCache } from '@server/lib/platform'
import dbPlugin from '@server/plugins/db'
import authPlugin from '@server/plugins/auth'
import queuePlugin from '@server/plugins/queue'
import websocketPlugin from '@server/plugins/websocket'
import { inMemoryQuoteCache } from '@server/features/fiat-rails/quote-cache'
import { buildContractRegistry } from '@server/chains/contracts'
import { TEST_DB_CONFIGURED } from './env'
import { leaseSlot, lockBaseDatabase, type SuiteLease } from './slot'
import {
  capturedBuilds,
  capturedRelays,
  fakeRegistry,
  TEST_ASSET,
  TEST_ASSET_ALT,
  TEST_CHAIN_ID,
  TEST_CHAIN_ID_ALT,
  TEST_NATIVE_ASSET,
} from './fake-chain'

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  registerErrorHandlers(app)

  await app.register(dbPlugin)
  await app.register(authPlugin)
  await app.register(queuePlugin)
  await app.register(websocketPlugin)
  const chainRegistry = fakeRegistry()
  app.decorate('chains', chainRegistry)
  // Built from the SAME adapters, through the production builder, so the
  // contract each escrow resolves to cannot disagree with the one the fake
  // adapter would transact with. No stored history rows: one contract per
  // chain, which is what makes an unstamped escrow resolve to it rather than
  // being refused as ambiguous (chains/contracts/resolve.ts).
  app.decorate('contracts', buildContractRegistry(chainRegistry.list(), []))
  // The plugins dir isn't autoloaded here, so the quote-cache plugin never
  // runs — decorate the behaviourally-identical in-memory cache so fiat quote
  // + initiate exercise the real path (no Redis dependency in tests).
  app.decorate('quoteCache', inMemoryQuoteCache())

  await app.register(AutoLoad, {
    dir: join(__dirname, '..', '..', '..', 'src', 'routes'),
    routeParams: true,
  })
  await app.ready()
  return app
}

/**
 * Suites run in sibling processes (node --test = one process per file,
 * concurrent) and each LEASES ITS OWN DATABASE from the pool in ./slot (#49).
 * They no longer queue behind one global lock, because they no longer share the
 * database that lock was protecting. Unit suites are untouched.
 */
async function leaseSuiteLease(): Promise<SuiteLease> {
  return leaseSlot(process.env.TEST_DATABASE_URL as string)
}

/**
 * Serialise a file that must use the BASE database instead of a slot.
 *
 * The boot-time suites take a URL as an argument and test code that holds a
 * CLUSTER-wide advisory lock, so they cannot be isolated by giving them their
 * own database — see `lockBaseDatabase`. They keep the pre-#49 behaviour: one
 * lock, one at a time. Pair with `{ skip: !TEST_DB_CONFIGURED }`.
 */
export function useSuiteLock(): void {
  let slot: SuiteLease | null = null
  before(async () => {
    if (!TEST_DB_CONFIGURED) return
    slot = await lockBaseDatabase(process.env.TEST_DATABASE_URL as string)
  })
  after(async () => {
    if (slot !== null) await slot.release()
  })
}

/**
 * Per-suite boilerplate: leases a database, boots the app once, resets it
 * between tests, releases on exit. Returns a getter (the instance doesn't exist
 * until the before hook runs). Pair with `{ skip: !TEST_DB_CONFIGURED }`.
 */
export function useTestApp(): () => FastifyInstance {
  let app: FastifyInstance
  let slot: SuiteLease | null = null
  before(async () => {
    if (!TEST_DB_CONFIGURED) return
    slot = await leaseSuiteLease()
    app = await buildTestApp()
  })
  after(async () => {
    if (!TEST_DB_CONFIGURED) return
    // `app` is undefined when before() failed — don't mask the root error.
    if (app !== undefined) await app.close()
    if (slot !== null) await slot.release()
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
  // The build capture describes rows this truncate is about to erase.
  capturedBuilds.length = 0
  capturedRelays.length = 0
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
