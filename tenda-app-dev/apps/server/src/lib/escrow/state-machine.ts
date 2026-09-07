/**
 * Escrow state machine, status/transition types, the pure status mapper, the
 * legality check, and their internal guards. The executable encoding of the
 * stage-0 § state-machine diagram, keep them in sync.
 */

import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'

export type EscrowStatus =
  | 'draft'
  | 'open'
  | 'accepted'
  | 'submitted'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'disputed'
  | 'resolved'

export type EscrowTransition =
  | 'publish'
  | 'accept'
  | 'decline'
  | 'assign_accept'
  | 'unassign'
  | 'submit'
  | 'approve'
  | 'claim_stalled'
  | 'cancel'
  | 'refund_expired'
  | 'reclaim_abandoned'
  | 'dispute'
  | 'resolve'

export type Caller = 'creator' | 'counterparty' | 'assigned_counterparty' | 'dispute_admin'

export interface TransitionContext {
  status: EscrowStatus
  caller: Caller
  now: Date
  accept_deadline: Date | null
  completion_deadline: Date | null
  approval_deadline: Date | null
  /** From `platform_config.grace_period_seconds`. */
  grace_period_seconds: number
  /** True iff `assigned_counterparty_id` is set on the row. */
  is_assigned: boolean
  /** Approval mode: `accept` is closed and only the creator can move it. */
  requires_approval: boolean
  /**
   * Create-time duration, used to DERIVE when the escrow was accepted
   * (`completion_deadline - completion_duration_seconds`, exactly as both
   * contracts do). Nothing stores `accepted_at`: a second copy of a derivable
   * fact is a drift vector, and the derivation is exact on both accept paths.
   */
  completion_duration_seconds: number | null
  /** The escrow's OWN window, mirrored from chain — not today's config. */
  unassign_window_seconds: number
}

/**
 * When the escrow was accepted, derived the same way both contracts derive it.
 * Null when it has not been accepted, or the duration is missing.
 */
export function acceptedAt(ctx: TransitionContext): Date | null {
  if (ctx.completion_deadline === null || ctx.completion_duration_seconds === null) return null
  return new Date(ctx.completion_deadline.getTime() - ctx.completion_duration_seconds * 1_000)
}

/**
 * Pure mapper: given the current state + transition, return the resulting
 * status. **Assumes** the transition is legal, callers MUST first call
 * `assertCanTransition(ctx, t)` (it throws on illegal). Splitting the pure
 * mapping from the legality check keeps each function single-purpose and
 * makes testing the transition table cheap.
 */
export function nextStatus(_ctx: TransitionContext, t: EscrowTransition): EscrowStatus {
  switch (t) {
    case 'publish':
      return 'open'
    case 'accept':
    case 'assign_accept':
      return 'accepted'
    case 'unassign':
      // The one BACKWARD edge in the machine: the escrow returns to the pool.
      return 'open'
    case 'decline':
      // Decline keeps status `open`, clears the assignment elsewhere. The
      // status itself doesn't change. Per stage-0 § state machine + the EVM
      // contract spec (stage-3-base.md `declineAssignedEscrow`).
      return 'open'
    case 'cancel':
      return 'cancelled'
    case 'refund_expired':
    case 'reclaim_abandoned':
      return 'refunded'
    case 'submit':
      return 'submitted'
    case 'approve':
    case 'claim_stalled':
      return 'completed'
    case 'dispute':
      return 'disputed'
    case 'resolve':
      return 'resolved'
  }
}

/**
 * Throws an `AppError` with a precise code if the transition is disallowed
 * by the state machine, caller, or deadline. Returns `void` on legal
 * transitions, call `nextStatus(ctx, t)` next.
 */
function requireApprovalMode(ctx: TransitionContext, t: EscrowTransition): void {
  if (!ctx.requires_approval) {
    throw new AppError(
      409,
      ErrorCode.ESCROW_WRONG_STATUS,
      `${t} applies only to approval-mode gigs`,
    )
  }
}

export function assertCanTransition(ctx: TransitionContext, t: EscrowTransition): void {
  switch (t) {
    case 'publish':
      requireStatus(ctx, 'draft', t)
      requireCaller(ctx, ['creator'], t)
      return
    case 'accept':
      requireStatus(ctx, 'open', t)
      if (ctx.requires_approval) {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          'this gig is approval-only; apply and wait for the poster to assign you',
        )
      }
      if (ctx.is_assigned) {
        requireCaller(ctx, ['assigned_counterparty'], t)
      } else {
        requireCaller(ctx, ['counterparty'], t)
      }
      requireBefore(ctx, ctx.accept_deadline, 'accept_deadline')
      return
    case 'assign_accept':
      requireStatus(ctx, 'open', t)
      requireApprovalMode(ctx, t)
      requireCaller(ctx, ['creator'], t)
      requireBefore(ctx, ctx.accept_deadline, 'accept_deadline')
      return
    case 'unassign': {
      requireStatus(ctx, 'accepted', t)
      // `requires_approval` is the on-chain witness that the worker was PLACED
      // rather than that they accepted. A worker who signed for themselves is
      // unreachable here, at any time — mirrored from the contracts so the
      // server never builds a transaction the chain would reject.
      requireApprovalMode(ctx, t)
      requireCaller(ctx, ['creator'], t)
      const from = acceptedAt(ctx)
      requireBefore(ctx, addSeconds(from, ctx.unassign_window_seconds), 'unassign_window')
      return
    }
    case 'decline':
      requireStatus(ctx, 'open', t)
      if (!ctx.is_assigned) {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          `decline requires an assigned counterparty`,
        )
      }
      requireCaller(ctx, ['assigned_counterparty'], t)
      return
    case 'cancel':
      requireStatus(ctx, 'open', t)
      requireCaller(ctx, ['creator'], t)
      return
    case 'refund_expired':
      requireStatus(ctx, 'open', t)
      requireCaller(ctx, ['creator'], t)
      requireAfter(ctx, ctx.accept_deadline, 'accept_deadline')
      return
    case 'submit':
      requireStatus(ctx, 'accepted', t)
      requireCaller(ctx, ['counterparty'], t)
      requireBefore(ctx, addSeconds(ctx.completion_deadline, ctx.grace_period_seconds), 'completion_deadline+grace')
      return
    case 'reclaim_abandoned':
      requireStatus(ctx, 'accepted', t)
      requireCaller(ctx, ['creator'], t)
      requireAfter(ctx, addSeconds(ctx.completion_deadline, ctx.grace_period_seconds), 'completion_deadline+grace')
      return
    case 'dispute':
      if (ctx.status !== 'accepted' && ctx.status !== 'submitted') {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          `cannot dispute from status '${ctx.status}'; must be 'accepted' or 'submitted'`,
        )
      }
      requireCaller(ctx, ['creator', 'counterparty'], t)
      return
    case 'approve':
      requireStatus(ctx, 'submitted', t)
      requireCaller(ctx, ['creator'], t)
      return
    case 'claim_stalled':
      requireStatus(ctx, 'submitted', t)
      requireCaller(ctx, ['counterparty'], t)
      requireAfter(ctx, ctx.approval_deadline, 'approval_deadline')
      return
    case 'resolve':
      requireStatus(ctx, 'disputed', t)
      requireCaller(ctx, ['dispute_admin'], t)
      return
  }
}

/** Convenience: assert + map in one call. */
export function transition(ctx: TransitionContext, t: EscrowTransition): EscrowStatus {
  assertCanTransition(ctx, t)
  return nextStatus(ctx, t)
}

// ---------- internal guards ----------------------------------------------

function requireStatus(ctx: TransitionContext, expected: EscrowStatus, t: EscrowTransition): void {
  if (ctx.status !== expected) {
    throw new AppError(
      409,
      ErrorCode.ESCROW_WRONG_STATUS,
      `cannot ${t} from status '${ctx.status}'; must be '${expected}'`,
    )
  }
}

function requireCaller(
  ctx: TransitionContext,
  allowed: ReadonlyArray<Caller>,
  t: EscrowTransition,
): void {
  if (!allowed.includes(ctx.caller)) {
    throw new AppError(
      403,
      ErrorCode.ESCROW_WRONG_CALLER,
      `caller '${ctx.caller}' cannot ${t}; allowed: ${allowed.join(', ')}`,
    )
  }
}

function requireBefore(ctx: TransitionContext, deadline: Date | null, label: string): void {
  if (deadline === null) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, `${label} missing on escrow row, transition requires it`)
  }
  if (ctx.now.getTime() >= deadline.getTime()) {
    throw new AppError(409, ErrorCode.ESCROW_DEADLINE_PASSED, `${label} has passed`)
  }
}

function requireAfter(ctx: TransitionContext, deadline: Date | null, label: string): void {
  if (deadline === null) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, `${label} missing on escrow row, transition requires it`)
  }
  if (ctx.now.getTime() < deadline.getTime()) {
    throw new AppError(409, ErrorCode.ESCROW_DEADLINE_NOT_REACHED, `${label} not yet reached`)
  }
}

function addSeconds(d: Date | null, seconds: number): Date | null {
  return d === null ? null : new Date(d.getTime() + seconds * 1000)
}
