/**
 * db/seed-v2.ts applySeed — registry facts UPSERT so a redeploy propagates on
 * re-seed (the pre-fix DO NOTHING stranded a stale escrow address in the dev
 * registry after the Base Sepolia redeploy), and enablement reconciles to the
 * active set. DB-backed, gated on TEST_DATABASE_URL; restores the registry
 * exactly as found (the suite shares this DB).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import postgres from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { eq, inArray, notInArray } from 'drizzle-orm'
import { assets, chains } from '@tenda/shared/db/schema/chains'
import { TEST_DB_CONFIGURED, useSuiteLock } from '../helpers/test-app'
import { applySeed, buildSeedRows } from '@server/db/seed-v2'
import type { ResolvedChainSecret } from '@server/chains/secrets'

const skip = !TEST_DB_CONFIGURED

// This suite mutates the shared registry with its own client — hold the
// cross-process suite lock so a sibling harness TRUNCATE can't wipe it mid-run.
useSuiteLock()

const CHAIN_ID = 'eip155:84532'
const ESCROW_V1 = `0x${'11'.repeat(20)}`
const ESCROW_V2 = `0x${'22'.repeat(20)}`
const TREASURY = `0x${'33'.repeat(20)}`

function sepoliaSecrets(escrow: string): Map<string, ResolvedChainSecret> {
  return new Map<string, ResolvedChainSecret>([
    [
      CHAIN_ID,
      {
        namespace: 'eip155',
        chainId: CHAIN_ID,
        rpcUrl: 'http://127.0.0.1:59999',
        escrow,
        treasury: TREASURY,
      },
    ],
  ])
}

/** The manifest assets that belong to the active chain. */
const BASE_ASSET_IDS = ['USDC_BASE', 'ETH_BASE']

type ChainSnapshot = typeof chains.$inferSelect
type AssetSnapshot = typeof assets.$inferSelect

/**
 * `is_enabled` for the active chain and its assets, keyed by id.
 *
 * A Record rather than an array so deepStrictEqual is order-independent AND a
 * missing row fails (the key is simply absent) instead of silently reading as
 * disabled.
 */
async function enablementOf(db: PostgresJsDatabase): Promise<Record<string, boolean>> {
  const chainRows = await db
    .select({ id: chains.id, enabled: chains.is_enabled })
    .from(chains)
    .where(eq(chains.id, CHAIN_ID))
  const assetRows = await db
    .select({ id: assets.id, enabled: assets.is_enabled })
    .from(assets)
    .where(inArray(assets.id, BASE_ASSET_IDS))
  return Object.fromEntries([...chainRows, ...assetRows].map((r) => [r.id, r.enabled]))
}

/** Put the registry back exactly as snapshotted: created rows deleted, pre-existing rows restored field-for-field. */
async function restoreRegistry(
  db: PostgresJsDatabase,
  chainRows: ChainSnapshot[],
  assetRows: AssetSnapshot[],
): Promise<void> {
  const assetIds = assetRows.map((a) => a.id)
  const chainIds = chainRows.map((c) => c.id)
  // assets first (FK on chain_id), then chains
  if (assetIds.length > 0) await db.delete(assets).where(notInArray(assets.id, assetIds))
  else await db.delete(assets)
  if (chainIds.length > 0) await db.delete(chains).where(notInArray(chains.id, chainIds))
  else await db.delete(chains)
  for (const row of chainRows) {
    await db.update(chains).set(row).where(eq(chains.id, row.id))
  }
  for (const row of assetRows) {
    await db.update(assets).set(row).where(eq(assets.id, row.id))
  }
}

test('applySeed: redeployed escrow address propagates on re-seed; reconcile owns enablement', { skip }, async () => {
  const client = postgres(process.env.DATABASE_URL as string, { max: 1 })
  const db = drizzle(client)
  try {
    const chainsBefore = await db.select().from(chains)
    const assetsBefore = await db.select().from(assets)
    try {
      // First deploy: rows land, active chain enabled.
      await applySeed(db, buildSeedRows(sepoliaSecrets(ESCROW_V1)))
      let [row] = await db
        .select({ escrow: chains.escrow_program, treasury: chains.treasury_address, enabled: chains.is_enabled })
        .from(chains)
        .where(eq(chains.id, CHAIN_ID))
      assert.equal(row?.escrow, ESCROW_V1)
      assert.equal(row?.treasury, TREASURY)
      assert.equal(row?.enabled, true)

      // Redeploy: same chain id, new contract — the FACT must follow config.
      // (Pre-fix DO NOTHING kept ESCROW_V1 here.)
      await applySeed(db, buildSeedRows(sepoliaSecrets(ESCROW_V2)))
      ;[row] = await db
        .select({ escrow: chains.escrow_program, treasury: chains.treasury_address, enabled: chains.is_enabled })
        .from(chains)
        .where(eq(chains.id, CHAIN_ID))
      assert.equal(row?.escrow, ESCROW_V2)

      // Assets upserted for the active chain (USDC token from the manifest).
      const assetRows = await db
        .select({ id: assets.id, token: assets.token_address, enabled: assets.is_enabled })
        .from(assets)
        .where(inArray(assets.id, ['USDC_BASE', 'ETH_BASE']))
      assert.equal(assetRows.length, 2)
      const usdc = assetRows.find((a) => a.id === 'USDC_BASE')
      assert.ok(usdc?.token?.startsWith('0x'), 'USDC token address seeded from manifest')

      // Reconcile: every chain outside the active set is now disabled.
      const others = await db
        .select({ id: chains.id, enabled: chains.is_enabled })
        .from(chains)
        .where(notInArray(chains.id, [CHAIN_ID]))
      for (const other of others) {
        assert.equal(other.enabled, false, `${other.id} should be disabled by the reconcile`)
      }
    } finally {
      await restoreRegistry(db, chainsBefore, assetsBefore)
    }
  } finally {
    await client.end()
  }
})

test('applySeed is ATOMIC — a failing asset write rolls the chains write back', { skip }, async () => {
  // Without the transaction, `chains` commits and `assets` does not. That state
  // is invisible to assertChainRegistryInSync, whose whole premise is "chains
  // agree with config, therefore the seed ran, therefore assets are current" —
  // so a stale token_address gets served as though it were verified. Under
  // SEED_ON_BOOT this runs on every container start, so "fails midway" is
  // routine rather than hypothetical.
  const client = postgres(process.env.DATABASE_URL as string, { max: 1 })
  const db = drizzle(client)
  try {
    const chainsBefore = await db.select().from(chains)
    const assetsBefore = await db.select().from(assets)
    try {
      await applySeed(db, buildSeedRows(sepoliaSecrets(ESCROW_V1)))
      // A sentinel that only survives if the chains write is undone.
      await db.update(chains).set({ escrow_program: 'SENTINEL' }).where(eq(chains.id, CHAIN_ID))

      // Poison AFTER the chains upsert: an asset pointing at a chain that does
      // not exist violates the FK, so the apply fails partway through.
      const poisoned = buildSeedRows(sepoliaSecrets(ESCROW_V2))
      poisoned.assets[0] = { ...poisoned.assets[0], chain_id: 'eip155:000000' }
      await assert.rejects(() => applySeed(db, poisoned), 'the poisoned seed must fail')

      const [row] = await db
        .select({ escrow: chains.escrow_program })
        .from(chains)
        .where(eq(chains.id, CHAIN_ID))
      assert.equal(
        row?.escrow,
        'SENTINEL',
        'chains was committed while assets failed — the apply is not atomic',
      )
    } finally {
      await restoreRegistry(db, chainsBefore, assetsBefore)
    }
  } finally {
    await client.end()
  }
})

test('applySeed writes NOTHING when enablement already matches', { skip }, async () => {
  // The "no diff, no write" property. Blanket UPDATEs would reach the same end
  // state and satisfy every value assertion, while burning a dead tuple per row
  // per boot and letting a rolling deploy flap: replicas with different envs
  // take turns flipping the same rows while clients poll /v1/platform/chains.
  //
  // Observed via xmin (the writing transaction id), because a re-write of the
  // SAME value is invisible by value. The probe row is inactive AND already
  // disabled, so the upsert never touches it — any xmin change is the
  // enablement UPDATE and nothing else.
  const client = postgres(process.env.DATABASE_URL as string, { max: 1 })
  const db = drizzle(client)
  const PROBE = 'eip155:999994'
  try {
    const chainsBefore = await db.select().from(chains)
    const assetsBefore = await db.select().from(assets)
    try {
      await client`
        insert into chains (id, namespace, display_name, treasury_address, escrow_program, is_enabled)
        values (${PROBE}, 'eip155', 'no-write probe', '0xbeef', '0xdead', false)
        on conflict (id) do update set is_enabled = false`
      const xminOf = async (): Promise<string> => {
        const [r] = await client`select xmin::text as x from chains where id = ${PROBE}`
        return r.x as string
      }
      const before = await xminOf()

      await applySeed(db, buildSeedRows(sepoliaSecrets(ESCROW_V1)))

      assert.equal(
        await xminOf(),
        before,
        'an already-correct row was rewritten — the enablement delta is being ignored',
      )
    } finally {
      await client`delete from chains where id = ${PROBE}`
      await restoreRegistry(db, chainsBefore, assetsBefore)
    }
  } finally {
    await client.end()
  }
})

test('applySeed RE-ENABLES a chain and its assets when the config comes back', { skip }, async () => {
  // The recovery direction, and the one an operator leans on immediately after
  // an incident: the CHAIN_* vars went missing, the boot disabled the chain and
  // its assets, the vars are restored — the next boot must bring them back.
  //
  // Nothing else can do it. `is_enabled` is deliberately absent from BOTH
  // conflict sets in applySeedRows, so the upserts re-write every other column
  // and leave enablement dark; only the toEnable half of the delta flips it.
  // Delete either of those two UPDATEs and the registry stays unreachable while
  // every other assertion in this file still passes.
  const client = postgres(process.env.DATABASE_URL as string, { max: 1 })
  const db = drizzle(client)
  try {
    const chainsBefore = await db.select().from(chains)
    const assetsBefore = await db.select().from(assets)
    try {
      // A healthy deploy, as the first test leaves it.
      await applySeed(db, buildSeedRows(sepoliaSecrets(ESCROW_V1)))
      assert.deepStrictEqual(
        await enablementOf(db),
        { [CHAIN_ID]: true, USDC_BASE: true, ETH_BASE: true },
        'the seed did not bring the active chain up in the first place',
      )

      // The state a boot with the vars missing leaves behind: rows still there,
      // everything dark.
      await db.update(chains).set({ is_enabled: false }).where(eq(chains.id, CHAIN_ID))
      await db.update(assets).set({ is_enabled: false }).where(inArray(assets.id, BASE_ASSET_IDS))

      // Control. Without it, a setup that quietly stopped matching rows would
      // leave the registry already enabled and the assertion below would pass
      // for entirely the wrong reason.
      assert.deepStrictEqual(
        await enablementOf(db),
        { [CHAIN_ID]: false, USDC_BASE: false, ETH_BASE: false },
        'setup failed to darken the registry — the re-enable assertion would be vacuous',
      )

      // Vars restored, redeploy.
      await applySeed(db, buildSeedRows(sepoliaSecrets(ESCROW_V1)))
      assert.deepStrictEqual(
        await enablementOf(db),
        { [CHAIN_ID]: true, USDC_BASE: true, ETH_BASE: true },
        'restoring the config did not bring the chain back — the re-enable path is broken',
      )
    } finally {
      await restoreRegistry(db, chainsBefore, assetsBefore)
    }
  } finally {
    await client.end()
  }
})
