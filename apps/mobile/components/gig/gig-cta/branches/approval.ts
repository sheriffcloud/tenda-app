/**
 * The approval-mode half of "which CTA does this gig show" — apply, assign,
 * release — as a pure function over the gig and the viewer.
 *
 * A priority chain rather than a set, because these branches genuinely exclude
 * each other: you are the poster OR an applicant OR the assigned worker, never
 * two at once. The LIFECYCLE half is a set, and lives next door.
 *
 * No rule is invented here. Each branch reads a SHARED `can*` helper, so this
 * file decides ordering and nothing else.
 */

import {
  canApply,
  canAssign,
  canReleaseAssignment,
  canUnassign,
  canWithdrawApplication,
  type GigDetail,
} from '@tenda/shared'
import type { CtaSlot } from '../types'
import { approvalContextOf } from '../parties'

/** Approval-mode branches, most specific first. */
export type ApprovalBranch =
  /** Poster, gig open: go pick someone. */
  | 'assign'
  /** Poster, worker assigned, still inside the unassign window. */
  | 'unassign'
  /** Assigned worker: the free off-chain way out. */
  | 'release'
  /** Worker with a live application: wait, or pull it. */
  | 'withdraw'
  /** Worker who may raise their hand. */
  | 'apply'
  /** Worker whose application lost — passed, expired, withdrawn or released. */
  | 'lost'

/**
 * `release` is the reason this file changed shape.
 *
 * It used to suppress the whole lifecycle half, so an assigned worker saw "I'm
 * not available" and NOTHING ELSE — Submit Proof only appeared once they had
 * tapped it, which is the opposite of what either button means. Putting it in
 * `secondary` lets Submit Proof keep `primary` and both be true at once.
 */
export const APPROVAL_SLOTS: Record<ApprovalBranch, CtaSlot> = {
  assign: 'primary',
  unassign: 'primary',
  release: 'secondary',
  withdraw: 'primary',
  apply: 'primary',
  lost: 'notice',
}

export function approvalBranch(
  gig: GigDetail,
  userId: string,
  grace_period_seconds: number,
  now: Date = new Date(),
): ApprovalBranch | null {
  if (!gig.requires_approval) return null
  const ctx = approvalContextOf(gig)
  const application = gig.viewer?.application ?? null

  if (canAssign(ctx, userId, now)) return 'assign'
  if (canUnassign(ctx, userId, now)) return 'unassign'
  if (canReleaseAssignment(ctx, userId, grace_period_seconds, now)) return 'release'
  if (canWithdrawApplication(application)) return 'withdraw'
  if (canApply(ctx, userId, application)) return 'apply'

  // A lost application, said plainly rather than shown as nothing — which
  // reads as "your application vanished".
  //
  // Deliberately excludes the WINNER: an `assigned` application belongs to
  // whoever is now doing the work, and they need Submit Proof / Add Proof from
  // the lifecycle branches, not a status line about a gig they are halfway
  // through.
  if (
    application !== null &&
    application.status !== 'open' &&
    application.status !== 'assigned' &&
    gig.counterparty?.id !== userId
  ) {
    return 'lost'
  }
  return null
}
