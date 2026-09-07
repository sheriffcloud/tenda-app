/**
 * Approval-mode action visibility: who may apply, withdraw, assign, unassign,
 * or step back from an assignment.
 *
 * These sit beside the lifecycle helpers rather than inside the screens for
 * the reason the mode-blind `canAccept` proved: a rule copied into a component
 * is a rule that drifts from the contract that actually enforces it. Every
 * predicate here mirrors a guard the server and the chain re-check.
 */

import { APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS } from '../../constants/applications'
import type { ApplicationStatus } from '../../constants/applications'
import type { EscrowAcceptanceMode, EscrowLike, EscrowVisibility } from './types'
import { toDate } from './types'
import { isDeliveryWindowOpen, type DeliveryWindow } from './lifecycle'

const MS_PER_SECOND = 1_000

/** Just enough of an application to judge it; the full wire type satisfies it. */
export interface ApplicationLike {
  status: ApplicationStatus
}

type ApprovalEscrow = EscrowLike & EscrowAcceptanceMode

/**
 * Approval mode AND still taking workers.
 *
 * The single gate both ENTRY helpers below share, which is why the takedown
 * check lives here rather than in each: a listing an admin has pulled is taking
 * nobody, whether they would apply or be assigned. `canUnassign` and
 * `canReleaseAssignment` deliberately do NOT come through here — they are ways
 * out of an assignment that already exists.
 */
function isOpenForApplications(e: ApprovalEscrow & EscrowVisibility): boolean {
  if (e.hidden) return false
  return e.requires_approval && e.status === 'open'
}

/**
 * Whether this user may raise their hand.
 *
 * An existing OPEN application blocks it — not because re-applying breaks
 * anything (the server upserts), but because offering "Apply" to someone whose
 * application is already live tells them their earlier one did not count.
 * A withdrawn or expired row does NOT block: changing your mind is the whole
 * point of the upsert.
 */
export function canApply(
  e: ApprovalEscrow & EscrowVisibility,
  userId: string,
  application: ApplicationLike | null,
): boolean {
  if (!isOpenForApplications(e) || userId === e.creator_id) return false
  return application === null || application.status !== 'open'
}

/**
 * Withdraw is judged on the APPLICATION alone, exactly like the DELETE route:
 * the row must still be open. Anything else is already settled, and the server
 * answers a withdraw on it with a 409 rather than a silent success.
 */
export function canWithdrawApplication(application: ApplicationLike | null): boolean {
  return application !== null && application.status === 'open'
}

/**
 * Whether the poster may assign someone. Past `accept_deadline` the chain
 * refuses the transition (the escrow is on the refund path), so the button
 * goes with it — same shape as `canClaim` reading `approval_deadline`.
 */
export function canAssign(
  e: ApprovalEscrow & EscrowVisibility & { accept_deadline: string | Date | null },
  userId: string,
  now: Date = new Date(),
): boolean {
  if (!isOpenForApplications(e) || userId !== e.creator_id) return false
  const deadline = toDate(e.accept_deadline)
  return deadline === null || now <= deadline
}

/** Escrow fields the unassign window is derived from. */
export interface AssignmentTiming {
  completion_deadline: string | Date | null
  completion_duration_seconds: number | null
  unassign_window_seconds: number
}

/**
 * When the assignment was made, derived exactly as both contracts derive it:
 * `completion_deadline - completion_duration_seconds`. Nothing stores it, and
 * deriving beats storing here — a stored copy could disagree with the chain.
 */
export function assignmentAcceptedAt(e: AssignmentTiming): Date | null {
  const deadline = toDate(e.completion_deadline)
  if (deadline === null || e.completion_duration_seconds === null) return null
  return new Date(deadline.getTime() - e.completion_duration_seconds * MS_PER_SECOND)
}

/** Last moment the poster may unassign; null when the timing is unknown. */
export function unassignWindowEndsAt(e: AssignmentTiming): Date | null {
  const acceptedAt = assignmentAcceptedAt(e)
  if (acceptedAt === null) return null
  return new Date(acceptedAt.getTime() + e.unassign_window_seconds * MS_PER_SECOND)
}

/**
 * Whether the poster may still withdraw an assignment. Approval mode only:
 * `requires_approval` is the chain's own witness that the worker never signed,
 * and yanking a worker who DID sign is a transition both contracts reject.
 */
export function canUnassign(
  e: ApprovalEscrow & AssignmentTiming,
  userId: string,
  now: Date = new Date(),
): boolean {
  if (!e.requires_approval || e.status !== 'accepted' || userId !== e.creator_id) return false
  const endsAt = unassignWindowEndsAt(e)
  return endsAt !== null && now < endsAt
}

/**
 * Whether the assigned worker may say they are not available.
 *
 * Off-chain and free, because they signed nothing to be assigned — charging
 * gas for the honest exit would make ghosting the cheaper option. Once stamped
 * it does not re-arm, so the CTA disappears rather than lying about a second
 * release doing anything.
 *
 * BOUNDED BY THE DELIVERY WINDOW, and that bound is load-bearing rather than
 * tidy. Releasing suppresses the abandonment strike (features/reputation
 * `signalsFor`, `escrow.abandoned`). Unbounded, a worker could ghost the whole
 * window and then release just before the poster reclaims — taking no penalty
 * at all, which makes ghosting-then-releasing strictly better than the honest
 * early exit this feature exists to reward. The release prompt has always
 * PROMISED this bound ("do it before the delivery window runs out"); nothing
 * enforced it.
 *
 * Same window as `submit` on purpose: deliver or say you cannot are the
 * worker's two mutually-exclusive moves, so closing them together leaves no
 * gap in either direction.
 */
export function canReleaseAssignment(
  e: ApprovalEscrow & DeliveryWindow & { assignment_released_at: string | Date | null },
  userId: string,
  grace_period_seconds: number,
  now: Date = new Date(),
): boolean {
  if (!e.requires_approval || e.status !== 'accepted') return false
  if (e.counterparty_id !== userId || e.assignment_released_at !== null) return false
  return isDeliveryWindowOpen(e, grace_period_seconds, now)
}

/**
 * How much room is left to assign someone else (critical assessment #3):
 * `accept_deadline` does NOT extend across assign/unassign cycles, so a poster
 * cycling workers can run the clock out and end up on the refund path.
 *
 * Three states rather than a "is it tight?" boolean, because the two ways of
 * being out of room have different consequences and therefore need different
 * words. Past the deadline the poster cannot assign ANYONE — releasing commits
 * them to a refund and a repost — and a gig assigned shortly before its
 * deadline spends most of its unassign window in exactly that state, since the
 * window is measured from the assignment, not from the deadline.
 */
export type AcceptWindowState =
  /** Room to find and assign a replacement. */
  | 'open'
  /** Under `APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS` left; warn. */
  | 'closing'
  /** Deadline gone: no replacement is possible at all. */
  | 'closed'

export function acceptWindowState(
  e: { accept_deadline: string | Date | null },
  now: Date = new Date(),
): AcceptWindowState {
  const deadline = toDate(e.accept_deadline)
  // An indefinitely-open gig has no clock to run out.
  if (deadline === null) return 'open'
  const remainingMs = deadline.getTime() - now.getTime()
  // Exactly ON the deadline still counts as room, because `canAssign` above
  // says so (`now <= deadline`) — two helpers in this file disagreeing about
  // the same instant is how a screen ends up warning "you cannot assign
  // anyone" beside a live Assign button.
  if (remainingMs < 0) return 'closed'
  return remainingMs < APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS * MS_PER_SECOND
    ? 'closing'
    : 'open'
}
