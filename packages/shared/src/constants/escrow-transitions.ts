import type { EscrowTxType, EscrowStatusName } from './escrow'

export type EscrowSyncEvidence = 'status' | 'assignment_cleared'

export interface EscrowTransitionSyncRule {
  readonly from: readonly ('draft' | EscrowStatusName)[]
  readonly to: EscrowStatusName
  readonly evidence: EscrowSyncEvidence
}

/**
 * Exhaustive client/server convergence contract. This mirrors the on-chain
 * state machine; `decline` needs projection evidence because open → open alone
 * cannot prove that its assignment-clearing event was applied.
 */
export const ESCROW_TRANSITION_SYNC: Record<EscrowTxType, EscrowTransitionSyncRule> = {
  create: { from: ['draft'], to: 'open', evidence: 'status' },
  accept: { from: ['open'], to: 'accepted', evidence: 'status' },
  decline: { from: ['open'], to: 'open', evidence: 'assignment_cleared' },
  assign_accept: { from: ['open'], to: 'accepted', evidence: 'status' },
  unassign: { from: ['accepted'], to: 'open', evidence: 'status' },
  submit: { from: ['accepted'], to: 'submitted', evidence: 'status' },
  approve: { from: ['submitted'], to: 'completed', evidence: 'status' },
  claim_stalled: { from: ['submitted'], to: 'completed', evidence: 'status' },
  cancel: { from: ['open'], to: 'cancelled', evidence: 'status' },
  refund_expired: { from: ['open'], to: 'refunded', evidence: 'status' },
  reclaim_abandoned: { from: ['accepted'], to: 'refunded', evidence: 'status' },
  dispute: { from: ['accepted', 'submitted'], to: 'disputed', evidence: 'status' },
  resolve: { from: ['disputed'], to: 'resolved', evidence: 'status' },
}

export interface EscrowSyncProjection {
  readonly status: 'draft' | EscrowStatusName
  readonly is_assigned?: boolean
}

export function hasAppliedEscrowTransition(
  action: EscrowTxType,
  projection: EscrowSyncProjection,
): boolean {
  const rule = ESCROW_TRANSITION_SYNC[action]
  if (projection.status !== rule.to) return false
  return rule.evidence === 'status' || projection.is_assigned === false
}
