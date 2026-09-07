import { hasAppliedEscrowTransition, type EscrowSyncProjection, type EscrowTxType } from '@tenda/shared'

/** Read-through convergence check shared by gig, exchange and create flows. */
export async function checkEscrowTransitionApplied(
  action: EscrowTxType | null,
  read: () => Promise<EscrowSyncProjection>,
): Promise<boolean> {
  if (action === null) return false
  return hasAppliedEscrowTransition(action, await read())
}
