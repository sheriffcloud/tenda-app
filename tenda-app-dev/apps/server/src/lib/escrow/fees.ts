/**
 * Platform-fee math (raw base units). BigInt division truncates toward zero,
 * equivalent to floor for non-negative inputs, which is what we want (DB CHECK
 * ensures `amount_raw > 0` and `fee_bps ∈ [0, 10000]`).
 */

import type { AmountRaw } from '@server/chains/types'

export interface FeeArgs {
  amount_raw: AmountRaw
  is_seeker: boolean
  fee_bps: number
  seeker_fee_bps: number
}

/** Returns the platform fee in raw units, rounded toward zero. */
export function computePlatformFee(args: FeeArgs): AmountRaw {
  const amount = BigInt(args.amount_raw)
  const bps = BigInt(effectiveBps(args))
  return ((amount * bps) / 10_000n).toString()
}

/** Returns `amount - fee`, what the counterparty actually receives. */
export function computeNetPayout(args: FeeArgs): AmountRaw {
  const amount = BigInt(args.amount_raw)
  const fee = BigInt(computePlatformFee(args))
  return (amount - fee).toString()
}

function effectiveBps(args: FeeArgs): number {
  return args.is_seeker ? args.seeker_fee_bps : args.fee_bps
}
