/**
 * The boot-time fee check: read every configured chain, compare to `platform_config`,
 * and say so LOUDLY on a mismatch. Nothing else.
 *
 * It never writes (not the DB, not a chain), never throws, and never delays boot: the
 * caller does not await it. A chain that cannot be read is logged as unknown at warn
 * level, which is not an alert. The contract charges its own stored value regardless,
 * so the worst a disagreement does is show a wrong estimate; the cost of a false
 * alarm is an operator learning to ignore this line.
 *
 * KNOWN GAP, accepted: a long-running server does not notice a direct on-chain
 * `setFeeBps` until its next restart. `fee:check` asks on demand.
 */
import { platform_config } from '@tenda/shared/db/schema'
import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared'
import type { FastifyBaseLogger } from 'fastify'
import type { ChainAdapter } from '@server/chains/types'
import type { AppDatabase } from '@server/plugins/db'
import { compareFees, describeComparison, readChainFees, type FeeComparison } from './fees'

/** The fees `platform_config` carries, read FRESH (never through the 5-minute cache), or the seed defaults when unseeded. */
export async function configuredFees(db: AppDatabase): Promise<{ fee_bps: number; seeker_fee_bps: number }> {
  const [row] = await db.select().from(platform_config).limit(1)
  return {
    fee_bps: row?.fee_bps ?? PLATFORM_CONFIG_DEFAULTS.fee_bps,
    seeker_fee_bps: row?.seeker_fee_bps ?? PLATFORM_CONFIG_DEFAULTS.seeker_fee_bps,
  }
}

export async function checkPlatformFees(args: {
  db: AppDatabase
  adapters: readonly Pick<ChainAdapter, 'chain_id' | 'getFees'>[]
  log: Pick<FastifyBaseLogger, 'error' | 'warn' | 'info'>
}): Promise<FeeComparison | null> {
  try {
    const configured = await configuredFees(args.db)
    const comparison = compareFees(configured, await readChainFees(args.adapters))
    if (comparison.mismatched.length > 0) {
      args.log.error(
        { platform_fee_mismatch: comparison.mismatched, unknown: comparison.unknown },
        `platform fee mismatch on ${comparison.mismatched.length} chain(s): the app shows ${configured.fee_bps}/${configured.seeker_fee_bps} bps but a contract charges otherwise. Run \`pnpm --filter tenda-server fee:check\`; fix with \`fee:set\`.`,
      )
    } else if (comparison.unknown.length > 0) {
      args.log.warn({ unknown: comparison.unknown }, 'platform fee check: some chains could not be read (not a mismatch)')
    } else {
      args.log.info({ chains: comparison.agreeing.length }, 'platform fee check: every chain agrees with platform_config')
    }
    return comparison
  } catch (err) {
    // Whatever went wrong (DB down, a bad adapter), the check is advisory: report and carry on.
    args.log.warn({ err }, 'platform fee check could not run')
    return null
  }
}

export { describeComparison }
