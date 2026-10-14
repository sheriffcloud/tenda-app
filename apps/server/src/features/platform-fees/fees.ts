/**
 * Platform fees live in TWO places that nothing kept in step: each chain's contract
 * (what users are actually charged) and the `platform_config` row (what the app
 * displays and projects payouts from). This is the pure half of keeping them honest:
 * what a valid fee pair is, how to read every chain, and how to compare.
 *
 * The contract always charges its OWN stored value, so a disagreement can only ever
 * make the DISPLAYED estimate wrong, never a charge. That is why the comparison
 * only reports: nothing here writes, and a chain that cannot be read is UNKNOWN,
 * never a mismatch (an RPC blip must not page anyone about a fee).
 */
import { ESCROW_LIMITS } from '@tenda/shared'
import type { ChainAdapter, ChainFees } from '@server/chains/types'

/** Why a pair is not a valid (fee, seeker fee), or null when it is. Mirrors the contracts' own refusal. */
export function feePairProblem(fee_bps: number, seeker_fee_bps: number): string | null {
  if (!Number.isInteger(fee_bps) || !Number.isInteger(seeker_fee_bps)) return 'fees must be whole basis points'
  if (fee_bps < 0 || seeker_fee_bps < 0) return 'fees cannot be negative'
  if (fee_bps > ESCROW_LIMITS.maxPlatformFeeBps) {
    return `fee ${fee_bps} bps exceeds the contracts' maximum of ${ESCROW_LIMITS.maxPlatformFeeBps}`
  }
  if (seeker_fee_bps > fee_bps) return `seeker fee ${seeker_fee_bps} bps must not exceed the standard fee ${fee_bps}`
  return null
}

/** One chain's read: its fees, or why it could not be read. */
export type ChainFeeRead =
  | { chain_id: string; fees: ChainFees; error?: undefined }
  | { chain_id: string; fees: null; error: string }

/**
 * Read every adapter's fees, one chain failing never costing the others.
 * `allSettled`, not `all`: an unreachable node is a fact about THAT chain.
 */
export async function readChainFees(adapters: readonly Pick<ChainAdapter, 'chain_id' | 'getFees'>[]): Promise<ChainFeeRead[]> {
  const settled = await Promise.allSettled(adapters.map(async (adapter) => adapter.getFees()))
  return settled.map((result, index): ChainFeeRead => {
    const chain_id = adapters[index].chain_id
    return result.status === 'fulfilled'
      ? { chain_id, fees: result.value }
      : { chain_id, fees: null, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }
  })
}

export interface FeeComparison {
  /** Chains whose contract charges something other than the configured pair. */
  mismatched: Array<{ chain_id: string; on_chain: ChainFees; configured: ChainFees }>
  /** Chains that could not be read: UNKNOWN, not a mismatch. */
  unknown: Array<{ chain_id: string; error: string }>
  /** Chains confirmed to agree. */
  agreeing: string[]
}

export function compareFees(configured: ChainFees, reads: readonly ChainFeeRead[]): FeeComparison {
  const result: FeeComparison = { mismatched: [], unknown: [], agreeing: [] }
  for (const read of reads) {
    if (read.fees === null) {
      result.unknown.push({ chain_id: read.chain_id, error: read.error })
    } else if (read.fees.fee_bps === configured.fee_bps && read.fees.seeker_fee_bps === configured.seeker_fee_bps) {
      result.agreeing.push(read.chain_id)
    } else {
      result.mismatched.push({ chain_id: read.chain_id, on_chain: read.fees, configured })
    }
  }
  return result
}

/**
 * `fee:check`'s process exit code: 0 every chain agrees, 1 at least one contract
 * charges something else, 2 nothing disagrees but some chain could not be read.
 * A mismatch outranks an unreadable chain: a known disagreement is the louder fact.
 */
export function feeCheckExitCode(comparison: FeeComparison): 0 | 1 | 2 {
  if (comparison.mismatched.length > 0) return 1
  return comparison.unknown.length > 0 ? 2 : 0
}

/** One human line per finding, for logs and the scripts. */
export function describeComparison(comparison: FeeComparison): string[] {
  return [
    ...comparison.mismatched.map(
      (m) => `MISMATCH ${m.chain_id}: contract charges ${m.on_chain.fee_bps}/${m.on_chain.seeker_fee_bps} bps (fee/seeker), platform_config says ${m.configured.fee_bps}/${m.configured.seeker_fee_bps}`,
    ),
    ...comparison.unknown.map((u) => `UNKNOWN  ${u.chain_id}: could not be read (${u.error})`),
    ...comparison.agreeing.map((chain_id) => `ok       ${chain_id}`),
  ]
}
