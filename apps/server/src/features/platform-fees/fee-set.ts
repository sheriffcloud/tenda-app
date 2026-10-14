/**
 * The decision half of `fee:set`: given a TARGET pair and what every chain reports,
 * what is left to do, and (only when nothing is) write the DB.
 *
 * The contracts' admin is a multisig, so this script cannot move a fee itself; it
 * PREPARES the call for each chain that still needs one, and is safely re-run after
 * the multisig has executed them. The DB is written only when EVERY chain is read
 * and confirmed to charge the target, so the displayed number never gets ahead of
 * what any contract charges. A chain that cannot be read blocks the write: confirming
 * is the whole point.
 */
import { encodeFunctionData } from 'viem'
import { eq } from 'drizzle-orm'
import { platform_config } from '@tenda/shared/db/schema'
import { ESCROW_EVM_ABI } from '@server/chains/evm/rpc'
import type { AppDatabase } from '@server/plugins/db'
import { feePairProblem, readChainFees, type ChainFeeRead } from './fees'
import type { ChainAdapter, ChainFees } from '@server/chains/types'

export type FeeSetChainState =
  | { chain_id: string; state: 'at_target' }
  | { chain_id: string; state: 'needs_change'; current: ChainFees }
  | { chain_id: string; state: 'unreadable'; error: string }

export interface FeeSetPlan {
  target: ChainFees
  chains: FeeSetChainState[]
  /** True only when every chain was read and charges the target: the one condition that allows the DB write. */
  ready_to_write: boolean
}

/** Why `fee:set` should refuse the arguments before touching a chain, or null. */
export function feeSetArgsProblem(argv: readonly string[]): { problem: string } | { target: ChainFees } {
  if (argv.length !== 2) return { problem: 'usage: fee:set <fee_bps> <seeker_fee_bps>' }
  const [fee, seeker] = argv.map((value) => (/^\d+$/.test(value) ? Number(value) : Number.NaN))
  if (Number.isNaN(fee) || Number.isNaN(seeker)) return { problem: 'fee_bps and seeker_fee_bps must be whole numbers' }
  const problem = feePairProblem(fee, seeker)
  return problem === null ? { target: { fee_bps: fee, seeker_fee_bps: seeker } } : { problem }
}

export function planFeeSet(target: ChainFees, reads: readonly ChainFeeRead[]): FeeSetPlan {
  const chains = reads.map((read): FeeSetChainState => {
    if (read.fees === null) return { chain_id: read.chain_id, state: 'unreadable', error: read.error }
    return read.fees.fee_bps === target.fee_bps && read.fees.seeker_fee_bps === target.seeker_fee_bps
      ? { chain_id: read.chain_id, state: 'at_target' }
      : { chain_id: read.chain_id, state: 'needs_change', current: read.fees }
  })
  return { target, chains, ready_to_write: chains.every((c) => c.state === 'at_target') }
}

/** The EVM call a multisig must execute on the contract: `setFeeBps(fee, seeker)`. */
export function setFeeBpsCalldata(target: ChainFees): `0x${string}` {
  return encodeFunctionData({ abi: ESCROW_EVM_ABI, functionName: 'setFeeBps', args: [target.fee_bps, target.seeker_fee_bps] })
}

/** Write the confirmed pair. Updates the singleton row; callers must have checked `ready_to_write`. */
export async function writeConfiguredFees(db: AppDatabase, target: ChainFees): Promise<void> {
  const updated = await db
    .update(platform_config)
    .set({ fee_bps: target.fee_bps, seeker_fee_bps: target.seeker_fee_bps })
    .where(eq(platform_config.id, 1))
    .returning({ id: platform_config.id })
  if (updated.length === 0) {
    throw new Error('platform_config has no row to update: seed the database first (db:seed)')
  }
}

/**
 * Read every chain, plan, and write the DB only when the plan says every chain
 * charges the target. Returns what happened so the script can report it: this is the
 * whole `fee:set` flow minus argument parsing and printing.
 */
export async function runFeeSet(args: {
  db: AppDatabase
  adapters: readonly Pick<ChainAdapter, 'chain_id' | 'getFees'>[]
  target: ChainFees
}): Promise<{ plan: FeeSetPlan; wrote: boolean }> {
  const plan = planFeeSet(args.target, await readChainFees(args.adapters))
  if (!plan.ready_to_write) return { plan, wrote: false }
  await writeConfiguredFees(args.db, args.target)
  return { plan, wrote: true }
}
