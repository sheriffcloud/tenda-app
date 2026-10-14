/**
 * Escrow deadline math: accept window and completion window. Pure date
 * arithmetic; the windows themselves are the caller's. The APPROVAL deadline
 * is not computed here on purpose — the contract stamps it when proof lands
 * and the server copies it from the ProofSubmitted event (#148).
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
