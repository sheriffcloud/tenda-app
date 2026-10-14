import { useEffect } from 'react'
import { escrowFeeBreakdown, type EscrowFeeBreakdown } from '@tenda/shared'
import { usePlatformConfigStore } from '@/stores/platform-config.store'

export type { EscrowFeeBreakdown }

/**
 * Projected platform-fee breakdown for an escrow — what the counterparty is
 * actually credited at settlement.
 *
 * WIRING ONLY. The rule itself is `escrowFeeBreakdown` in @tenda/shared, and
 * that is the point: this hook and its twin in the other client each used to
 * claim to be the "single source for every 'X receives' figure" while writing
 * the tier selection, the percent formatting and the payout contract out
 * inline — so the math was forked across clients by the very files that said
 * it could not be (#41). What stays here is the store subscription, because
 * React does not belong in shared.
 *
 * `isSeeker` must be the tier baked into the ESCROW (escrows.is_seeker), not
 * the viewer's own status — pass the wire value on read surfaces.
 */
export function useEscrowFee(isSeeker: boolean, principalRaw: string): EscrowFeeBreakdown {
  const config = usePlatformConfigStore((s) => s.config)
  const fetchConfig = usePlatformConfigStore((s) => s.fetch)
  useEffect(() => {
    void fetchConfig()
  }, [fetchConfig])

  return escrowFeeBreakdown(config, isSeeker, principalRaw)
}
