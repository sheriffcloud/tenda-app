/**
 * The escrow action + on-chain event vocabulary, and the map from DB
 * transaction types to the event that confirms each one.
 *
 * `ESCROW_EVENTS` and `EVENT_BY_TX_TYPE` are exhaustive on purpose: a new event
 * or tx type breaks the build until it is classified, rather than decoding to
 * nothing at runtime.
 */

/**
 * Discriminated escrow action. The wire-name (`'createEscrow'`) maps to the
 * Solana instruction / Solidity function 1:1, adapters do not rename.
 */
export type EscrowAction =
  | 'createEscrow'
  | 'acceptEscrow'
  | 'declineAssignedEscrow'
  | 'assignAccept'
  | 'unassign'
  | 'submitProof'
  | 'approveCompletion'
  | 'claimStalledPayment'
  | 'cancelEscrow'
  | 'refundExpired'
  | 'reclaimAbandoned'
  | 'disputeEscrow'
  | 'resolveDispute'

/**
 * On-chain event names (PascalCase). Republished onto the internal queue
 * in snake_case by `chains/<ns>/verify.ts` per stage-2 convention.
 *
 * The runtime array and the type union are derived from the same const, so
 * `idempotency.ts` / `verify.ts` can iterate and validate without drift.
 */
export const ESCROW_EVENTS = [
  'EscrowCreated',
  'EscrowAccepted',
  'EscrowDeclined',
  'CounterpartyAssigned',
  'AssignmentReleased',
  'ProofSubmitted',
  'EscrowApproved',
  'PaymentClaimed',
  'EscrowCancelled',
  'EscrowExpired',
  'EscrowAbandoned',
  'DisputeRaised',
  'DisputeResolved',
] as const

export type EscrowEvent = (typeof ESCROW_EVENTS)[number]

/**
 * DB-vocabulary transaction types (`escrow_transactions.type` /
 * `tx_attempts.action`, snake_case). Single source lives in @tenda/shared
 * (mobile builds client-ping bodies from the same const, resolves
 * open_issues §10.9 for the tx-type axis); re-exported here so chain code
 * keeps one import surface.
 */
import type { EscrowTxType } from '@tenda/shared'
export { ESCROW_TX_TYPES, isEscrowTxType } from '@tenda/shared'
export type { EscrowTxType } from '@tenda/shared'

/**
 * Which on-chain event confirms each client-submitted action. The client
 * ping (`POST /v1/blockchain/transaction`) uses this to tell verify-tx what
 * to expect; the decoded event is the source of truth, never the hint.
 */
export const EVENT_BY_TX_TYPE: Record<EscrowTxType, EscrowEvent> = {
  create: 'EscrowCreated',
  accept: 'EscrowAccepted',
  decline: 'EscrowDeclined',
  assign_accept: 'CounterpartyAssigned',
  unassign: 'AssignmentReleased',
  submit: 'ProofSubmitted',
  approve: 'EscrowApproved',
  claim_stalled: 'PaymentClaimed',
  cancel: 'EscrowCancelled',
  refund_expired: 'EscrowExpired',
  reclaim_abandoned: 'EscrowAbandoned',
  dispute: 'DisputeRaised',
  resolve: 'DisputeResolved',
}
