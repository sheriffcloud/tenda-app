import type { PlatformConfig } from '../api/contracts/platform.contract'

/**
 * Platform fee in raw base units, BigInt-exact. Safe for 18-decimal assets
 * where the fee exceeds Number.MAX_SAFE_INTEGER (display/settlement math must
 * stay lossless). The floor division matches the on-chain contract.
 */
export function computePlatformFeeRaw(paymentLamports: bigint, feeBps: number): bigint {
  return (paymentLamports * BigInt(feeBps)) / 10_000n
}

/**
 * Compute the platform fee for a given payment amount using BigInt arithmetic
 * to avoid overflow and TypeError from bigint × number operations. Returns a
 * Number for legacy callers at USDC/SOL scale; prefer computePlatformFeeRaw
 * for exact base-unit math.
 */
export function computePlatformFee(paymentLamports: bigint, feeBps: number): number {
  return Number(computePlatformFeeRaw(paymentLamports, feeBps))
}

/**
 * The projected platform-fee breakdown for one escrow.
 *
 * Every field is null until the platform config has loaded, so a surface can
 * render "—" rather than a fee it does not yet know.
 */
export interface EscrowFeeBreakdown {
  /** Tier bps from live platform config; null until config loads. */
  feeBps: number | null
  /** Human percentage ('1.00'); null until config loads. */
  feePct: string | null
  /** Fee in asset base units; null until config loads. */
  feeRaw: bigint | null
  /** principal − fee in base units; null until config loads. */
  netRaw: bigint | null
}

const UNKNOWN_BREAKDOWN: EscrowFeeBreakdown = {
  feeBps: null,
  feePct: null,
  feeRaw: null,
  netRaw: null,
}

/**
 * What the counterparty is actually credited at settlement: the contract pays
 * `amount − fee` with floor division, at the live platform bps for the
 * escrow's tier.
 *
 * SHARED since #41, and the reason is that both clients' `useEscrowFee`
 * docstrings asserted "single source for every 'X receives' figure ... so the
 * fee math can never fork per surface" while three of the four rules — the
 * tier selection, the percent formatting and the payout contract — were
 * written out inline in each of them. Only the multiplication was shared. The
 * claim was true of the sentence and false of the code; if they drifted, web
 * and mobile would show different "you receive" amounts for the SAME escrow.
 *
 * `isSeeker` is the tier baked into the ESCROW (`escrows.is_seeker`), never
 * the viewer's own status — a read surface must pass the wire value or the
 * projection stops matching what the contract will charge.
 *
 * PRECONDITION on `principalRaw`: a canonical base-unit decimal string, or ''
 * for "no amount yet" (which answers zero, as `BigInt('')` is 0n). It is NOT
 * defended against arbitrary text, because nothing can supply any: every call
 * site passes a server `amount_raw`, a null-checked `parseUnits` result, or
 * the composer's `paymentRaw`, which #32 made canonical-or-empty.
 */
export function escrowFeeBreakdown(
  config: PlatformConfig | null,
  isSeeker: boolean,
  principalRaw: string,
): EscrowFeeBreakdown {
  if (config === null) return UNKNOWN_BREAKDOWN

  const feeBps = isSeeker ? config.seeker_fee_bps : config.fee_bps
  const principal = BigInt(principalRaw)
  const feeRaw = computePlatformFeeRaw(principal, feeBps)
  return {
    feeBps,
    feePct: (feeBps / 100).toFixed(2),
    feeRaw,
    netRaw: principal - feeRaw,
  }
}
