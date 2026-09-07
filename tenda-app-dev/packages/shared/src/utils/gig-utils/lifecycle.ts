/**
 * Client-side action-visibility helpers over the v2 escrow shape
 * (creator/counterparty vocabulary — gigs and exchanges alike). These
 * mirror, but never replace, the server's lib/escrow.ts state machine:
 * the server re-checks every transition.
 */

import type { EscrowAcceptanceMode, EscrowLike, EscrowVisibility } from './types'
import { isParty, toDate } from './types'

/**
 * Returns the most relevant deadline for an escrow given its status.
 * - open: accept_deadline (null if indefinitely open)
 * - accepted: completion_deadline (set at accept)
 * - submitted: approval_deadline (claim-stalled window)
 * - other: null
 */
export function computeRelevantDeadline(
  e: Pick<EscrowLike, 'status'> & {
    accept_deadline: string | Date | null
    completion_deadline: string | Date | null
    approval_deadline: string | Date | null
  },
): Date | null {
  const pick =
    e.status === 'open'
      ? e.accept_deadline
      : e.status === 'accepted'
        ? e.completion_deadline
        : e.status === 'submitted'
          ? e.approval_deadline
          : null
  return toDate(pick)
}

/**
 * Whether this user may sign the `createEscrow` that puts their draft live.
 *
 * Refused on a taken-down draft: publishing would fund an escrow nobody is
 * allowed to accept (see `canAccept`), so the creator would pay gas for a dead
 * listing. Discarding it is still offered — that is a way out, not a way in.
 */
export function canPublish(e: EscrowLike & EscrowVisibility, userId: string): boolean {
  if (e.hidden) return false
  return e.status === 'draft' && userId === e.creator_id
}

/**
 * Whether this user may send the `accept` transaction themselves.
 *
 * Mode-aware, and it has to be: both contracts reject an `acceptEscrow` on an
 * approval-mode escrow, and reject it from anyone but the named assignee on a
 * direct invite. Offering the button anyway costs the worker gas to discover a
 * revert, so the mode lives here rather than inline in each CTA.
 */
export function canAccept(
  e: EscrowLike & EscrowAcceptanceMode & EscrowVisibility,
  userId: string,
): boolean {
  // Taken down: closed to new entrants, whatever the mode says. First, because
  // every clause below is about WHO may enter and this one is about whether
  // anyone may.
  if (e.hidden) return false
  if (e.status !== 'open' || userId === e.creator_id) return false
  // Approval mode: the POSTER assigns. A worker applies instead (canApply).
  if (e.requires_approval) return false
  // Direct invite: the escrow names its worker, nobody else can take it.
  // Gated on `is_assigned`, not on the id being present: an outsider is served
  // the flag without the id, and judging by the id would read that as "open to
  // anyone" — the exact false Accept button this helper exists to prevent.
  if (e.is_assigned) return e.assigned_counterparty_id === userId
  return true
}

/**
 * Whether the named invitee may decline a direct offer.
 *
 * Mirrors the server's `decline` guard exactly (state-machine.ts): status
 * `open`, somebody is assigned, and the caller IS them. Notably NOT gated on
 * `requires_approval` — the state machine is not either — and NOT gated on
 * `hidden`, because declining is a way OUT: a worker invited to a listing that
 * was then taken down must still be able to say no.
 *
 * Extracted from the CTA, where it sat nested inside the `canAccept` branch and
 * so would have vanished the moment `canAccept` started refusing taken-down
 * listings. Two different questions; two helpers.
 */
export function canDecline(
  e: EscrowLike & EscrowAcceptanceMode,
  userId: string,
): boolean {
  if (e.status !== 'open' || !e.is_assigned) return false
  return e.assigned_counterparty_id === userId
}

export function canSubmit(e: EscrowLike, userId: string): boolean {
  return e.status === 'accepted' && e.counterparty_id === userId
}

/** Just the delivery clock, so both windows below read from one shape. */
export interface DeliveryWindow {
  completion_deadline: string | Date | null
}

/**
 * The last moment the worker may still act on their assignment — deliver it,
 * or say they cannot. `completion_deadline + grace_period_seconds`, exactly
 * what the server's `submit` and `reclaim_abandoned` guards compute.
 *
 * Null when there is no deadline: absence of a clock is not evidence one has
 * run out, and the server treats it the same way.
 *
 * Module-private, unlike `unassignWindowEndsAt` next door: nothing outside
 * needs the instant itself yet. Export it the day a countdown wants it, not
 * before.
 */
function deliveryWindowEndsAt(
  e: DeliveryWindow,
  grace_period_seconds: number,
): Date | null {
  const deadline = toDate(e.completion_deadline)
  return deadline === null ? null : new Date(deadline.getTime() + grace_period_seconds * 1_000)
}

/**
 * Whether that window is still open.
 *
 * Exists because the CLIENT used to ignore it entirely: `canSubmit` gates on
 * status and identity alone, so a worker past the deadline was offered Submit
 * Proof and got a 409, and the poster was offered Reclaim Escrow a full
 * `grace_period_seconds` before the server would allow it. The grace is on the
 * wire (`PlatformConfig`), so there is no reason for the two to disagree.
 *
 * Additive on purpose — `canSubmit`'s signature is unchanged because the P2P
 * exchange surface shares it and its payment window is a different clock.
 */
export function isDeliveryWindowOpen(
  e: DeliveryWindow,
  grace_period_seconds: number,
  now: Date = new Date(),
): boolean {
  const endsAt = deliveryWindowEndsAt(e, grace_period_seconds)
  // Strictly before, matching the server's `requireBefore` (`now >= deadline`
  // rejects). Exactly ON the boundary must not be a case where the button says
  // yes and the route says no.
  return endsAt === null || now.getTime() < endsAt.getTime()
}

/**
 * The counterparty (worker) may attach evidence while the poster reviews
 * (`submitted`) AND while the escrow is under dispute (`disputed`) — a
 * mediator often needs more proof mid-review, so the upload stays open until
 * the dispute resolves. Kept off-chain; it never changes the escrow status.
 */
export function canAddProof(e: EscrowLike, userId: string): boolean {
  return (e.status === 'submitted' || e.status === 'disputed') && e.counterparty_id === userId
}

export function canApprove(e: EscrowLike, userId: string): boolean {
  return e.status === 'submitted' && userId === e.creator_id
}

export function canDispute(e: EscrowLike, userId: string): boolean {
  return isParty(e, userId) && (e.status === 'accepted' || e.status === 'submitted')
}

export function canReview(e: EscrowLike, userId: string): boolean {
  return isParty(e, userId) && (e.status === 'completed' || e.status === 'resolved')
}

export function canCancel(e: EscrowLike, userId: string): boolean {
  return (e.status === 'draft' || e.status === 'open') && userId === e.creator_id
}

/**
 * Claim-stalled (counterparty, after approval_deadline passes with no
 * dispute). The server enforces the deadline on-chain; this only gates UI.
 */
export function canClaim(
  e: EscrowLike & { approval_deadline: string | Date | null },
  userId: string,
  now: Date = new Date(),
): boolean {
  if (e.status !== 'submitted' || e.counterparty_id !== userId) return false
  const deadline = toDate(e.approval_deadline)
  return deadline !== null && now > deadline
}
