/**
 * Internal event → standing signals (stage-7-reputation.md § What gets
 * tracked). Each event maps to zero, one or two signals, never any
 * branching on prior escrow state (that's why refund_expired and
 * reclaim_abandoned are separate events).
 *
 * Reputation deliberately ignores escrow.created / accepted /
 * proof_submitted / dispute_raised, they carry no signal.
 */

import type { StandingEventKind } from '@tenda/shared/db/schema/reputation'
import type { InternalEscrowEvent } from '@server/lib/escrow-events'

export interface EscrowParties {
  creator_id: string
  counterparty_id: string | null
}

export interface StandingSignal {
  user_id: string
  kind: StandingEventKind
  role: 'creator' | 'counterparty'
}

export interface SignalContext {
  parties: EscrowParties
  /** DisputeResolved only: who won + who raised. */
  dispute?: { winner: 'creator' | 'counterparty' | 'split'; raised_by: string }
  /**
   * Was the worker assigned from a live application of their own (D2)? False
   * for an instant accept — where it is irrelevant, because the worker signed
   * — and for a back-door assign, where nobody put their hand up.
   */
  assigned_from_application?: boolean
  /**
   * Approval mode. Needed to tell a BACK-DOOR assign apart from an ordinary
   * instant accept: both have `assigned_from_application: false`, but only in
   * approval mode did the worker sign nothing.
   */
  requires_approval?: boolean
  /** The worker told us they were unavailable before the deadline ran out. */
  assignment_released?: boolean
}

/**
 * Pure mapping. Returns the signals to record; an empty array means the
 * event is reputation-neutral.
 */
export function signalsFor(event: InternalEscrowEvent, ctx: SignalContext): StandingSignal[] {
  const { creator_id, counterparty_id } = ctx.parties
  switch (event) {
    case 'escrow.approved':
      // Both sides completed cleanly.
      return withCounterparty(counterparty_id, (cp) => [
        { user_id: creator_id, kind: 'completed', role: 'creator' },
        { user_id: cp, kind: 'completed', role: 'counterparty' },
      ])
    case 'escrow.payment_claimed':
      // Work was paid out, but the creator ghosted the approval.
      return withCounterparty(counterparty_id, (cp) => [
        { user_id: cp, kind: 'completed', role: 'counterparty' },
        { user_id: creator_id, kind: 'ghosted_approval', role: 'creator' },
      ])
    case 'escrow.abandoned':
      // D2: abandonment is only a fault if the worker CHOSE the gig and then
      // went quiet. Two cases are not that, and both would otherwise punish
      // someone for the poster's decision:
      //
      //  - the poster placed them without an application behind it, so they
      //    never opted in at all;
      //  - they said "not available" in time, which is the honest move this
      //    feature exists to make cheap.
      //
      // An ordinary instant-mode accept is unaffected: those escrows are not
      // assigned from applications, so the flag is only consulted when the
      // escrow was in approval mode to begin with.
      if (ctx.assignment_released === true) return []
      if (ctx.requires_approval === true && ctx.assigned_from_application !== true) return []
      return withCounterparty(counterparty_id, (cp) => [
        { user_id: cp, kind: 'abandoned', role: 'counterparty' },
      ])
    case 'escrow.declined':
      // Neutral by design (workers should decline rather than abandon),
      // and the assignee never became the counterparty, there is no
      // reliable user id on the escrow row to record against. No signal.
      return []
    case 'escrow.cancelled':
      return [{ user_id: creator_id, kind: 'cancelled', role: 'creator' }]
    case 'escrow.dispute_resolved': {
      if (ctx.dispute === undefined) return []
      const { winner } = ctx.dispute
      if (winner === 'split') return [] // no behavioural fault assigned
      return withCounterparty(counterparty_id, (cp) =>
        winner === 'creator'
          ? [
              { user_id: creator_id, kind: 'disputed_won', role: 'creator' },
              { user_id: cp, kind: 'disputed_lost', role: 'counterparty' },
            ]
          : [
              { user_id: cp, kind: 'disputed_won', role: 'counterparty' },
              { user_id: creator_id, kind: 'disputed_lost', role: 'creator' },
            ],
      )
    }
    // Reputation-neutral events:
    //  - `expired` = nobody accepted, so no counterparty ever existed.
    //  - `counterparty_assigned` is approval mode's accept, neutral for the
    //    same reason `accepted` is: taking on work is not yet an outcome.
    //  - `assignment_released` is the creator withdrawing an assignment inside
    //    the unassign window. The worker did nothing, so nothing counts
    //    against them; and whether the creator's withdrawal should cost
    //    anything depends on whether the worker had APPLIED (D2's
    //    `assigned_from_application`), which does not exist yet. Recording a
    //    signal now would be guesswork.
    case 'escrow.counterparty_assigned':
    case 'escrow.assignment_released':
    case 'escrow.created':
    case 'escrow.accepted':
    case 'escrow.proof_submitted':
    case 'escrow.dispute_raised':
    case 'escrow.expired':
      return []
  }
}

function withCounterparty(
  counterparty_id: string | null,
  build: (cp: string) => StandingSignal[],
): StandingSignal[] {
  return counterparty_id === null ? [] : build(counterparty_id)
}
