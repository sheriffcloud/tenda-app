/**
 * Opt-in boot-time registry seed (SEED_ON_BOOT=true), the sibling of
 * `migrateOnBoot`.
 *
 * WHY THIS EXISTS. `db:seed` writes the chain/asset registry from config, and
 * nothing ran it on deploy — so it was run by hand, from whatever artifact was
 * to hand. On 2026-08-06 that artifact was older than the server: it rewrote
 * `chains.escrow_program` to a superseded contract and left the Solana row on a
 * program id from before `df4ea8e`, and the boot guard crash-looped the
 * container. The tell was Solana, whose id comes from the COMPILED IDL rather
 * than env, so no environment could have produced that value — only an older
 * build could.
 *
 * Running the seed in-process removes that failure mode by construction: there
 * is no separate artifact to be stale. The seed sees exactly the env and
 * exactly the IDL the server itself is running.
 *
 * `assertChainRegistryInSync` stays as-is. With SEED_ON_BOOT on it should never
 * fire, which is the point — it goes back to being a backstop for
 * migrate-then-roll deployments rather than the thing that blocks a deploy.
 *
 * Ordering is load-bearing: after `migrateOnBoot` (it writes tables migrations
 * create) and before the chains plugin (whose guard it exists to satisfy).
 *
 * The "would this strand anybody" decision lives in ./guard.
 */

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { getChainSecrets } from '@server/chains/secrets'
import { buildSeedRows, applySeedRows } from '@server/db/seed-v2'
import { getConfig } from '@server/config'
import { acquireBootLock } from '@server/lib/boot-lock'
import {
  findBlockedDisables,
  describeBlockedDisable,
  unacknowledgedDisables,
  DISABLE_OVERRIDE,
} from './guard'
import type { FastifyBaseLogger } from 'fastify'

export * from './guard'

type BootLogger = Pick<FastifyBaseLogger, 'info' | 'warn'>

/**
 * The message for a deploy that reached the seed with no chains configured.
 *
 * Without this the next statement is drizzle's `values() must be called with at
 * least one value` — technically a safe failure (nothing is written, the
 * transaction never opens, and a health-gated rollout keeps the old replicas
 * serving) but it names neither chains nor env, and an unreadable boot error is
 * exactly what turned a stale-artifact seed into an afternoon of guessing.
 *
 * `loadChainSecrets` returns an EMPTY map rather than throwing when no `CHAIN_*`
 * vars are set — every manifest entry is simply skipped as inactive — so this is
 * the only place the condition can be named.
 */
export const NO_CHAINS_CONFIGURED =
  'SEED_ON_BOOT: no chains are configured — every CHAIN_* secret is missing from ' +
  'this environment, so the seed has nothing to write. Restore the chain env ' +
  'vars for this deployment (see .env.example) and redeploy.'

/**
 * Seed the registry from the running process's own config.
 *
 * Fails the boot on error; `startServer` turns that into exit 1, so a
 * health-gated rollout keeps the old replicas serving rather than promoting a
 * server whose registry is wrong.
 */
export async function seedOnBoot(log: BootLogger, databaseUrl?: string): Promise<void> {
  if (process.env.SEED_ON_BOOT !== 'true') return

  const rows = buildSeedRows(getChainSecrets())
  if (rows.chains.length === 0) throw new Error(NO_CHAINS_CONFIGURED)
  const activeChainIds = rows.chains.map((c) => c.id)
  const activeAssetIds = rows.assets.map((a) => a.id)

  const sql = postgres(databaseUrl ?? getConfig().DATABASE_URL, { max: 1 })
  try {
    log.info('SEED_ON_BOOT: waiting for advisory lock')
    await acquireBootLock(sql)
    const db = drizzle(sql)

    // Guard and seed share ONE transaction, so a refusal cannot leave a partial
    // write behind and the count cannot go stale before it is acted on.
    await db.transaction(async (tx) => {
      const blocked = await findBlockedDisables(tx, activeChainIds, activeAssetIds)
      // Each kind is cleared by its OWN flag, so acknowledging a routine asset
      // retirement can never wave through a chain disable that traps funds.
      const unacknowledged = unacknowledgedDisables(blocked, process.env)

      if (unacknowledged.length > 0) {
        throw new Error(`SEED_ON_BOOT: ${describeBlockedDisable(unacknowledged)}`)
      }
      for (const b of blocked) {
        log.warn(
          `SEED_ON_BOOT: disabling ${b.entity} ${b.id} with ${b.unsettled} unsettled ` +
            `escrow(s) — acknowledged via ${DISABLE_OVERRIDE[b.entity]}`,
        )
      }

      await applySeedRows(tx, rows)
    })

    // Reported every boot: this is the value that was wrong, so it is the value
    // worth being able to grep for in a deploy log.
    for (const c of rows.chains) {
      log.info(`SEED_ON_BOOT: ${c.id} escrow_program=${c.escrow_program}`)
    }
    for (const s of rows.skipped) log.warn(`SEED_ON_BOOT: skipped ${s}`)
    log.info(
      `SEED_ON_BOOT: registry current — ${rows.chains.length} chain(s), ${rows.assets.length} asset(s)`,
    )
  } finally {
    await sql.end() // closes the session, which releases the advisory lock
  }
}
