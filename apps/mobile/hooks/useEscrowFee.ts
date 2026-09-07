import { useEffect } from 'react'
import { computePlatformFeeRaw } from '@tenda/shared'
import { usePlatformConfigStore } from '@/stores/platform-config.store'

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

/**
 * Projected platform-fee breakdown for an escrow: what the counterparty is
 * actually credited at settlement (contract: payout = amount − fee, floor
 * division, live platform bps by the escrow's is_seeker tier). Single source
 * for every "X receives" figure — FeeSummary, gig/exchange detail, confirm
 * dialogs — so the fee math can never fork per surface.
 *
 * `isSeeker` must be the tier baked into the ESCROW (escrows.is_seeker), not
 * the viewer's own status — pass the wire value on read surfaces.
 */
export function useEscrowFee(isSeeker: boolean, principalRaw: string): EscrowFeeBreakdown {
  const config = usePlatformConfigStore((s) => s.config)
  const fetchConfig = usePlatformConfigStore((s) => s.fetch)
  useEffect(() => { void fetchConfig() }, [fetchConfig])

  if (config === null) return { feeBps: null, feePct: null, feeRaw: null, netRaw: null }

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
