/**
 * The ordinary-lifecycle half: everything an escrow offers regardless of how
 * it was taken up.
 *
 * Returns a SET, not a winner. Most states really do offer more than one legal
 * move — approve or dispute, claim or add proof or dispute — and the previous
 * shape encoded those pairs by hand inside individual branches, which is how
 * "+ Dispute" ended up copied into five of them and then silently dropped from
 * a sixth. Each rule below stands alone; the bar arranges them by slot.
 *
 * Every rule mirrors a guard `assertCanTransition` re-checks, INCLUDING the
 * deadlines. A button the server would 409 is not a smaller bug than a missing
 * one — it just fails later.
 */

import {
  canAccept,
  canAddProof,
  canClaim,
  canDecline,
  canDispute,
  canReview,
  canSubmit,
  isDeliveryWindowOpen,
} from '../utils/gig-utils'
import type { GigDetail } from '../types/gig'
import type { CtaSlot } from './types'
import { partiesOf } from './parties'

export type LifecycleBranch =
  | 'deleteDraft'
  | 'retryDraft'
  | 'refundExpired'
  | 'accept'
  /** Direct invite only: the named worker declining, which had no button. */
  | 'decline'
  | 'cancel'
  | 'submit'
  | 'approve'
  | 'claimStalled'
  | 'addProof'
  /** Same action as addProof, different word, because a dispute is not review. */
  | 'addEvidence'
  | 'reclaim'
  /** Extracted from the five branches that each carried their own copy of it. */
  | 'dispute'
  | 'review'
  | 'disputedNotice'

export const LIFECYCLE_SLOTS: Record<LifecycleBranch, CtaSlot> = {
  retryDraft: 'primary',
  deleteDraft: 'secondary',
  refundExpired: 'primary',
  accept: 'primary',
  decline: 'secondary',
  cancel: 'secondary',
  submit: 'primary',
  approve: 'primary',
  claimStalled: 'primary',
  addProof: 'secondary',
  addEvidence: 'secondary',
  // Secondary, not primary, because it can COINCIDE with `unassign`: the
  // unassign window runs from the assignment (6h by default) while the
  // delivery window can be as short as MIN_COMPLETION_DURATION_SECONDS (1h),
  // so a poster on a short gig is legally able to do both at once. Two
  // primaries would have silently dropped one of them. This also keeps the
  // layout it has always had — Reclaim Escrow beside Dispute.
  reclaim: 'secondary',
  dispute: 'secondary',
  review: 'primary',
  disputedNotice: 'notice',
}

export function lifecycleBranches(
  gig: GigDetail,
  userId: string,
  grace_period_seconds: number,
  now: Date = new Date(),
): LifecycleBranch[] {
  const parties = partiesOf(gig)
  const isCreator = userId === gig.creator.id
  const out: LifecycleBranch[] = []

  // v2 drafts are pre-sign staging rows: signing happens in the create flow.
  // CO6 "retry from draft" prefills a fresh create instead of editing in place
  // (the unsigned tx is already bound to the old escrow id).
  if (gig.status === 'draft') {
    if (isCreator) out.push('retryDraft', 'deleteDraft')
    return out
  }

  if (gig.status === 'open') {
    // Display-derived expiry: v2 has no 'expired' status — the creator
    // reclaims via refund_expired.
    const acceptExpired =
      gig.accept_deadline !== null && new Date(gig.accept_deadline).getTime() < now.getTime()
    if (isCreator) {
      // Past the deadline `refund_expired` IS the cancel: same money, and the
      // only one of the two the server will still accept. Offering both would
      // be two buttons for one outcome, one of which 409s.
      out.push(acceptExpired ? 'refundExpired' : 'cancel')
    } else {
      if (canAccept(parties, userId)) out.push('accept')
      // A direct invite names its worker, and declining is a real transition
      // the state machine has always allowed — it simply had no button, so the
      // only way out of an invitation was to ignore it.
      //
      // A SIBLING of accept, not nested inside it, and that is load-bearing
      // now: `canAccept` refuses a taken-down listing, and declining is a way
      // OUT — an invitee whose gig was pulled from under them must still be
      // able to say no. Same output as the nested form in every other state,
      // which the arrangement matrix asserts.
      if (canDecline(parties, userId)) out.push('decline')
    }
    // Nothing below applies to an open escrow.
    return out
  }

  // The window `submit` closes on, which the client used to ignore entirely:
  // a worker past the deadline was shown Submit Proof and got a 409, and the
  // poster was shown Reclaim Escrow a full grace period before it was legal.
  const deliverable = isDeliveryWindowOpen(gig, grace_period_seconds, now)

  if (gig.status === 'accepted') {
    if (canSubmit(parties, userId) && deliverable) out.push('submit')
    if (isCreator && !deliverable) out.push('reclaim')
  }

  if (gig.status === 'submitted') {
    if (isCreator) out.push('approve')
    if (canAddProof(parties, userId)) {
      if (canClaim({ ...parties, approval_deadline: gig.approval_deadline }, userId, now)) {
        out.push('claimStalled')
      }
      out.push('addProof')
    }
  }

  // One rule instead of five hand-copied buttons: the poster may dispute any
  // live escrow; the worker may once they have submitted, or once they can no
  // longer submit and a dispute is their only remaining move. Not offered
  // while work is still deliverable, because a dispute costs a bond and
  // delivering is the cheaper answer.
  if (
    canDispute(parties, userId) &&
    (isCreator || gig.status === 'submitted' || !deliverable)
  ) {
    out.push('dispute')
  }

  if (gig.status === 'disputed') {
    // The worker keeps adding evidence while a mediator reviews; `canDispute`
    // is already false here, so no redundant Dispute button can appear.
    if (canAddProof(parties, userId)) out.push('addEvidence')
    out.push('disputedNotice')
  }

  if (canReview(parties, userId) && !gig.reviews.some((r) => r.reviewer_id === userId)) {
    out.push('review')
  }

  return out
}
