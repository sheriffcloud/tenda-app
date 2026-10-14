import { hasAppliedEscrowTransition, type EscrowSyncProjection } from '../../constants/escrow-transitions'
import type { EscrowTxType } from '../../constants/escrow'

/** Read-through convergence check shared by gig, exchange and create flows. */
export async function checkEscrowTransitionApplied(
  action: EscrowTxType | null,
  read: () => Promise<EscrowSyncProjection>,
): Promise<boolean> {
  if (action === null) return false
  return hasAppliedEscrowTransition(action, await read())
}
