/**
 * Per-event application table: one declarative entry per on-chain event,
 * which `escrow_transactions.type` it records, which prior statuses are legal
 * (the status guard), which decoded fields carry amount/fee/actor, and the
 * column patch it stamps. Decoded payloads come from the chain; the
 * webhook/client hint is never the source of truth. Internal event names are
 * republished in snake_case (stage-2 table).
 */

import type { EscrowEvent } from '@server/chains/types'
import { ESCROW_TRANSITION_SYNC, type EscrowTxType } from '@tenda/shared'
import type { EscrowStatus } from '@server/lib/escrow'
import type { EscrowPatch } from './store'

export const INTERNAL_EVENT_BY_WIRE = {
  EscrowCreated: 'escrow.created',
  EscrowAccepted: 'escrow.accepted',
  EscrowDeclined: 'escrow.declined',
  CounterpartyAssigned: 'escrow.counterparty_assigned',
  AssignmentReleased: 'escrow.assignment_released',
  ProofSubmitted: 'escrow.proof_submitted',
  EscrowApproved: 'escrow.approved',
  PaymentClaimed: 'escrow.payment_claimed',
  EscrowCancelled: 'escrow.cancelled',
  EscrowExpired: 'escrow.expired',
  EscrowAbandoned: 'escrow.abandoned',
  DisputeRaised: 'escrow.dispute_raised',
  DisputeResolved: 'escrow.dispute_resolved',
} as const satisfies Record<EscrowEvent, string>

export type InternalEscrowEvent = (typeof INTERNAL_EVENT_BY_WIRE)[EscrowEvent]

export interface EventApplication {
  tx_type: EscrowTxType
  /** Legal prior statuses, the status guard. */
  from: EscrowStatus[]
  /** Field name carrying the settled amount, if any. */
  amount_field?: string
  /** Field name carrying the platform fee, if any. */
  fee_field?: string
  /**
   * Field carrying the creator's principal share — resolve only, where a
   * split pays BOTH parties and amount_field (the counterparty share) can't
   * tell the whole story on its own.
   */
  creator_amount_field?: string
  /** Field naming the acting wallet (resolved to actor_id), if any. */
  actor_field?: string
  /**
   * How this event changes the escrow's counterparty, when it does.
   *
   * `field` names the decoded wallet; `effect` says whether that wallet is
   * installed on the row or released from it. Declarative rather than an
   * `if (event.name === …)` chain in the orchestrator, and deliberately ONE
   * concept rather than two: the orchestrator must resolve the wallet in
   * BOTH cases, because a released counterparty is no longer on the escrow
   * row and the notification fan-out has no other way to address them.
   */
  counterparty?: { field: string; effect: 'install' | 'release' }
  /**
   * Settle the assigned worker's gig application in the SAME transaction as
   * the transition: flip theirs to `assigned`, every sibling to `passed`, and
   * stamp `escrows.assigned_from_application`.
   *
   * Declared here rather than done in the route, because the route only builds
   * an unsigned transaction — settling there would burn an application on a
   * signature the user abandoned. And it must be atomic with the transition,
   * or a crash between the two would leave a worker assigned with no record of
   * why, silently costing them the strike D2 depends on.
   */
  settles_application?: true
  /**
   * The exact inverse: undo the assignment cycle in the SAME transaction as
   * the transition. Declared here rather than inferred from the event name so
   * `settles_application` and its reverse sit in one table and a reader can
   * see the pair is complete.
   */
  reverts_application_cycle?: true
  /** Build the column patch from decoded fields. */
  patch(fields: Record<string, string>): EscrowPatch
}

function unixField(fields: Record<string, string>, name: string): Date {
  return new Date(Number(fields[name]) * 1000)
}

function transitionFrom(type: EscrowTxType): EscrowStatus[] {
  return [...ESCROW_TRANSITION_SYNC[type].from]
}

function transitionStatus(type: EscrowTxType): EscrowStatus {
  return ESCROW_TRANSITION_SYNC[type].to
}

export const EVENT_APPLICATIONS: Record<EscrowEvent, EventApplication> = {
  EscrowCreated: {
    tx_type: 'create',
    from: transitionFrom('create'),
    amount_field: 'amount',
    actor_field: 'creator',
    patch: () => ({ status: transitionStatus('create') }),
  },
  EscrowAccepted: {
    tx_type: 'accept',
    from: transitionFrom('accept'),
    actor_field: 'counterparty',
    counterparty: { field: 'counterparty', effect: 'install' },
    patch: (f) => ({
      status: transitionStatus('accept'),
      completion_deadline: unixField(f, 'completion_deadline'),
    }),
  },
  // Approval mode's counterpart of EscrowAccepted. Same status transition and
  // same deadline stamp — only the actor differs (the creator placed the
  // worker), which is exactly why it is a distinct event and tx_type.
  CounterpartyAssigned: {
    tx_type: 'assign_accept',
    from: transitionFrom('assign_accept'),
    actor_field: 'assigned_by',
    counterparty: { field: 'counterparty', effect: 'install' },
    settles_application: true,
    patch: (f) => ({
      status: transitionStatus('assign_accept'),
      completion_deadline: unixField(f, 'completion_deadline'),
    }),
  },
  // The creator withdrew an assignment inside the unassign window. Mirrors
  // EscrowDeclined (assignment undone, funds untouched) but this one also
  // rewinds the status, because assign_accept had moved it to `accepted`.
  AssignmentReleased: {
    tx_type: 'unassign',
    from: transitionFrom('unassign'),
    actor_field: 'released_by',
    // `release` clears counterparty_id AND hands the orchestrator the user it
    // resolved, so the fan-out can still reach the worker who was let go —
    // by the time it runs, the row no longer names them.
    counterparty: { field: 'counterparty', effect: 'release' },
    reverts_application_cycle: true,
    patch: () => ({
      status: transitionStatus('unassign'),
      // completion_deadline must go with the status: an escrow rewound to
      // `open` that still carried a deadline would be judged by the expiry
      // sweep as if someone were working on it.
      completion_deadline: null,
      // And so must the rest of the cycle. These two describe ONE assignment,
      // not the escrow: leaving them behind made a re-assigned worker inherit
      // the previous one's release, which suppressed their abandonment strike
      // and dropped the gig out of their active-gig cap. See EscrowPatch.
      assignment_released_at: null,
      assigned_from_application: false,
    }),
  },
  EscrowDeclined: {
    tx_type: 'decline',
    from: transitionFrom('decline'),
    actor_field: 'declined_by',
    // Status stays open, the decline clears the assignment only.
    patch: () => ({ assigned_counterparty_id: null }),
  },
  ProofSubmitted: {
    tx_type: 'submit',
    from: transitionFrom('submit'),
    actor_field: 'counterparty',
    patch: (f) => ({
      status: transitionStatus('submit'),
      submitted_at: unixField(f, 'timestamp'),
      approval_deadline: unixField(f, 'approval_deadline'),
    }),
  },
  EscrowApproved: {
    tx_type: 'approve',
    from: transitionFrom('approve'),
    amount_field: 'amount',
    fee_field: 'platform_fee',
    actor_field: 'creator',
    patch: () => ({ status: transitionStatus('approve') }),
  },
  PaymentClaimed: {
    tx_type: 'claim_stalled',
    from: transitionFrom('claim_stalled'),
    amount_field: 'amount',
    fee_field: 'platform_fee',
    actor_field: 'counterparty',
    patch: () => ({ status: transitionStatus('claim_stalled') }),
  },
  EscrowCancelled: {
    tx_type: 'cancel',
    from: transitionFrom('cancel'),
    amount_field: 'refund_amount',
    actor_field: 'creator',
    patch: () => ({ status: transitionStatus('cancel') }),
  },
  EscrowExpired: {
    tx_type: 'refund_expired',
    from: transitionFrom('refund_expired'),
    amount_field: 'refund_amount',
    actor_field: 'creator',
    patch: () => ({ status: transitionStatus('refund_expired') }),
  },
  EscrowAbandoned: {
    tx_type: 'reclaim_abandoned',
    from: transitionFrom('reclaim_abandoned'),
    amount_field: 'refund_amount',
    actor_field: 'creator',
    patch: () => ({ status: transitionStatus('reclaim_abandoned') }),
  },
  DisputeRaised: {
    tx_type: 'dispute',
    from: transitionFrom('dispute'),
    amount_field: 'bond_amount',
    actor_field: 'raised_by',
    patch: () => ({ status: transitionStatus('dispute') }),
  },
  DisputeResolved: {
    tx_type: 'resolve',
    from: transitionFrom('resolve'),
    // Both contracts emit the distribution: the counterparty's principal
    // share rides amount_raw (consistent with approve/claim = "what the
    // counterparty side got"), the creator's share its own column.
    amount_field: 'counterparty_payout',
    creator_amount_field: 'creator_payout',
    fee_field: 'platform_fee',
    patch: () => ({ status: transitionStatus('resolve') }),
  },
}
