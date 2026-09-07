/**
 * Shapes the action-visibility helpers accept.
 *
 * Structural rather than nominal so one helper serves both wire projections
 * (ISO strings) and Drizzle rows, and both escrow kinds — gigs and P2P
 * exchanges are the same primitive with different vocabulary.
 */

import type { EscrowStatus } from '../../types/escrow'

export interface EscrowParties {
  creator_id: string
  counterparty_id: string | null
}

export type EscrowLike = EscrowParties & { status: EscrowStatus }

/**
 * How this escrow may be taken up. REQUIRED, not optional, and that is the
 * whole point: an optional mode field is how `canAccept` stayed mode-blind and
 * offered "Accept" on an escrow whose accept the chain would revert. Making it
 * required means every call site has to state which mode it is in, and a new
 * caller cannot forget.
 */
export interface EscrowAcceptanceMode {
  /** Approval mode: only the poster moves it forward, via `assign_accept`. */
  requires_approval: boolean
  /**
   * Whether SOMEONE is named as the assignee — spoken separately from WHO,
   * because the two have different audiences. "This gig is spoken for" is part
   * of the listing; the assignee's identity belongs to the parties, so the
   * detail route withholds the id from outsiders (see `escrow-detail-scope.ts`)
   * while keeping this flag accurate. Reading acceptability off the id alone
   * would make a withheld assignee look like an unassigned gig and offer a
   * stranger an Accept button the chain reverts.
   */
  is_assigned: boolean
  /**
   * Direct invite: only this user may accept. `null` when nobody is assigned —
   * OR when the reader is not entitled to know, hence `is_assigned` above.
   */
  assigned_counterparty_id: string | null
}

/**
 * Moderation visibility (CO1 `escrows.hidden`).
 *
 * REQUIRED on every ENTRY helper's input, for exactly the reason the acceptance
 * mode above is: an optional flag is one a new caller forgets, and the caller
 * who forgets it is the one offering an Accept button on a listing moderation
 * has pulled. Only the ways IN read it — `canAccept`, `canApply`, `canAssign`.
 * The ways OUT (submit, approve, cancel, refund, dispute, decline, review…)
 * deliberately do not, because a takedown must never strand funds that are
 * already locked on-chain.
 */
export interface EscrowVisibility {
  /** Taken down by an admin: off the public surfaces, closed to new entrants. */
  hidden: boolean
}

/**
 * An escrow open to anyone: no approval gate, nobody invited. A FIXTURE, for
 * tests that need "the unrestricted case" named rather than spelled out.
 *
 * NOT a stand-in for data a caller has not got. It used to be spread into the
 * exchange CTA on the reasoning that the exchange wire carried no assignee —
 * true of the wire, never true of the ESCROW: `assigned_counterparty_id` has no
 * kind restriction at create, so a direct-invite offer was reachable and every
 * reader was told it was open to anyone. Both detail wires now carry the real
 * mode (see `escrowPartiesOf`), which is the only correct source. If you are
 * reaching for this constant because a field is missing from a wire type, add
 * the field.
 */
// Readonly because it is a shared singleton every caller spreads: without it,
// one `UNRESTRICTED_ACCEPTANCE.requires_approval = true` anywhere would change
// the mode every screen that spreads it reports.
export const UNRESTRICTED_ACCEPTANCE: Readonly<EscrowAcceptanceMode> = {
  requires_approval: false,
  is_assigned: false,
  assigned_counterparty_id: null,
}

/**
 * A detail wire carrying its acceptance mode and its two user refs — the shape
 * both `GigDetail` and `ExchangeDetail` satisfy structurally. Structural on
 * purpose: the two kinds are one primitive with different vocabulary, and
 * naming either here would make this module depend on the wire types that
 * depend on it.
 */
export interface EscrowDetailLike extends EscrowAcceptanceMode, EscrowVisibility {
  status: EscrowStatus
  creator: { id: string }
  counterparty: { id: string } | null
}

/**
 * Project a detail wire onto the shape the `can*` helpers take.
 *
 * ONE projection for both kinds, because two of them is how the exchange copy
 * drifted: it hardcoded the acceptance mode while the gig copy read it, so the
 * same `canAccept` was answering a real question on one screen and a fixed
 * `false` on the other. A single builder cannot disagree with itself, and a
 * mode field added later reaches every screen at once.
 *
 * Both halves of the assignment are carried, never just the id — an outsider
 * is served `is_assigned` with `assigned_counterparty_id` withheld, and judging
 * off the id alone reads that as "open to anyone".
 *
 * `hidden` rides along for the same reason: this is the ONE place every surface
 * builds its `can*` input, so a takedown reaches the gig bar, the exchange bar
 * and the applicants screen at once rather than through three remembered edits.
 */
export function escrowPartiesOf(
  e: EscrowDetailLike,
): EscrowLike & EscrowAcceptanceMode & EscrowVisibility {
  return {
    status: e.status,
    creator_id: e.creator.id,
    counterparty_id: e.counterparty?.id ?? null,
    requires_approval: e.requires_approval,
    is_assigned: e.is_assigned,
    assigned_counterparty_id: e.assigned_counterparty_id,
    hidden: e.hidden,
  }
}

export function isParty(e: EscrowParties, userId: string): boolean {
  return userId === e.creator_id || userId === e.counterparty_id
}

/** Accepts both wire (ISO string) and row (Date) timestamps; null stays null. */
export function toDate(value: string | Date | null): Date | null {
  return value === null ? null : new Date(value)
}
