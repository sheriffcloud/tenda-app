import { useFeePercents } from '@/hooks/usePlatformConfig'
import { FEE_PCT, SEEKER_FEE_PCT } from '@/content'

interface Props {
  /**
   * Which rate to print. `standard` is what most escrows charge; `seeker` is
   * the reduced rate when the escrow's CREATOR is on a Solana Mobile device.
   * (Which rate applies is chosen by the creator; the fee itself is deducted
   * from the counterparty's payout — see useFeePercents.)
   */
  tier?: 'standard' | 'seeker'
}

/**
 * The platform fee as a live percentage, e.g. `2.5%`.
 *
 * Renders the configured rate from /v1/platform/config, falling back to the
 * shared platform-config default while that loads or if it fails — never to a
 * number typed into copy. The fee is admin-editable at runtime, so any surface
 * that can run a hook should print it through this rather than state it: the
 * hero already read the live value while the FAQ asserted a literal, which is
 * two numbers for one fact on a single screen.
 *
 * Deliberately a bare fragment with no wrapper element, so it drops into a
 * sentence (or a <strong>) without disturbing the typography around it.
 */
export function FeePct({ tier = 'standard' }: Props) {
  const { posterFeePct, seekerFeePct } = useFeePercents()
  const live = tier === 'seeker' ? seekerFeePct : posterFeePct
  const fallback = tier === 'seeker' ? SEEKER_FEE_PCT : FEE_PCT
  return <>{live != null ? `${live}%` : `${fallback}%`}</>
}
