/**
 * The gig detail projected onto the shapes the SHARED `can*` helpers take.
 *
 * One place builds it, so no branch of the CTA can forget the acceptance mode
 * and fall back to the mode-blind behaviour that offered "Accept Gig" on an
 * approval-mode gig — a button whose transaction both contracts revert.
 *
 * The projection itself now lives in shared as `escrowPartiesOf`, because the
 * exchange CTA needs the identical one and its private copy is exactly what
 * drifted. Kept as a named wrapper rather than a bare re-export: `escrowPartiesOf`
 * accepts either kind by design, and this export is gig-namespaced, so pinning
 * the parameter to `GigDetail` keeps a stray exchange offer from compiling at a
 * gig call site. Delegation, not duplication — the body still lives in one place.
 */
import { escrowPartiesOf } from '../utils/gig-utils/types'
import type { GigDetail } from '../types/gig'

export function partiesOf(gig: GigDetail) {
  return escrowPartiesOf(gig)
}

/** Adds the timing fields the approval-mode window helpers derive from. */
export function approvalContextOf(gig: GigDetail) {
  return {
    ...partiesOf(gig),
    accept_deadline: gig.accept_deadline,
    completion_deadline: gig.completion_deadline,
    completion_duration_seconds: gig.completion_duration_seconds,
    unassign_window_seconds: gig.unassign_window_seconds,
    assignment_released_at: gig.assignment_released_at,
  }
}
