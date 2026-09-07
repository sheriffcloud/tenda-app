/**
 * Escrow deadline math, accept window, completion window, approval window.
 * Pure date arithmetic; the windows themselves come from platform_config.
 */

export interface AcceptDeadlineArgs {
  now: Date
  accept_window_seconds: number
}

export function computeAcceptDeadline(a: AcceptDeadlineArgs): Date {
  return new Date(a.now.getTime() + a.accept_window_seconds * 1000)
}

export interface CompletionDeadlineArgs {
  accepted_at: Date
  completion_duration_seconds: number
}

export function computeCompletionDeadline(a: CompletionDeadlineArgs): Date {
  return new Date(a.accepted_at.getTime() + a.completion_duration_seconds * 1000)
}

export interface ApprovalDeadlineArgs {
  submitted_at: Date
  approval_window_seconds: number
}

export function computeApprovalDeadline(a: ApprovalDeadlineArgs): Date {
  return new Date(a.submitted_at.getTime() + a.approval_window_seconds * 1000)
}
