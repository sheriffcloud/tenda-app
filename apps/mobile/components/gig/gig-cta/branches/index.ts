/**
 * Every CTA the gig detail offers a viewer, as one list.
 *
 * The two families used to be mutually exclusive — approval asked first, and
 * if it answered, the lifecycle half never ran. That is what hid Submit Proof
 * behind "I'm not available", left an approval-mode poster with no way to
 * cancel their own gig, and made every future branch a question of whose
 * priority chain it belonged to. They are independent questions, so they are
 * asked independently and the SLOT decides where each answer lands.
 */

import type { GigDetail } from '@tenda/shared'
import type { CtaSlot } from '../types'
import { approvalBranch, APPROVAL_SLOTS, type ApprovalBranch } from './approval'
import { lifecycleBranches, LIFECYCLE_SLOTS, type LifecycleBranch } from './lifecycle'

export { approvalBranch, APPROVAL_SLOTS, type ApprovalBranch } from './approval'
export { lifecycleBranches, LIFECYCLE_SLOTS, type LifecycleBranch } from './lifecycle'

/**
 * A branch tagged with which renderer draws it. The discriminated union is
 * what lets the bar render either family without a cast — and what makes a new
 * branch a compile error in the renderer rather than a blank space.
 */
export type CtaBranch =
  | { family: 'approval'; id: ApprovalBranch; slot: CtaSlot }
  | { family: 'lifecycle'; id: LifecycleBranch; slot: CtaSlot }

export function gigCtaBranches(
  gig: GigDetail,
  userId: string,
  grace_period_seconds: number,
  now: Date = new Date(),
): CtaBranch[] {
  const out: CtaBranch[] = []

  const approval = approvalBranch(gig, userId, grace_period_seconds, now)
  if (approval !== null) {
    out.push({ family: 'approval', id: approval, slot: APPROVAL_SLOTS[approval] })
  }

  for (const id of lifecycleBranches(gig, userId, grace_period_seconds, now)) {
    out.push({ family: 'lifecycle', id, slot: LIFECYCLE_SLOTS[id] })
  }

  return out
}
