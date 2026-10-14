/**
 * What a taken-down listing says, and to whom.
 *
 * Three audiences, because only three people ever see this. The detail routes
 * serve a hidden escrow to its PARTIES and to admins and 404 everyone else, so
 * the reader is always one of: the person who posted it, the person working on
 * it, or a moderator looking at it.
 *
 * They need different things said. The poster has to learn their listing is off
 * the board AND be reassured their money is not — that pairing is the whole
 * message. The counterparty has to hear the opposite emphasis: nothing about
 * your job changed, finish it. A moderator needs a state label, not comfort.
 *
 * Moved from apps/mobile/components/escrow/takedown 2026-08-15 (copy +
 * audience derivation; the banner components stay per-client).
 */

/** Who is reading. Derived from ids already on the wire — never from a role. */
export type TakedownAudience = 'owner' | 'counterparty' | 'moderator'

export interface TakedownCopy {
  title: string
  detail: string
}

/**
 * Kind-aware, because "gig" and "offer" are the words those two surfaces use
 * everywhere else and a shared component that says "listing" to both would be
 * the only place on either screen that did.
 */
export type TakedownSubject = 'gig' | 'offer'

/** Where each kind's public listing lives, for the moderator's state label. */
const PUBLIC_SURFACE: Record<TakedownSubject, string> = {
  gig: 'feed',
  offer: 'order book',
}

export function takedownCopy(
  audience: TakedownAudience,
  subject: TakedownSubject,
): TakedownCopy {
  // The subject IS the noun — "this gig" / "this offer" — so it is used
  // directly rather than through a lookup that would only map each key to
  // itself.
  const noun = subject
  switch (audience) {
    case 'owner':
      return {
        title: 'Removed by moderation',
        detail: `This ${noun} is no longer public and nobody new can take it on. Work already in progress and any funds in escrow are unaffected.`,
      }
    case 'counterparty':
      return {
        title: 'Removed from public listings',
        detail: `This ${noun} was taken down by moderation, but your side of it is unchanged — carry on as normal and you will be paid the same way.`,
      }
    case 'moderator':
      return {
        title: 'Taken down',
        detail: `Hidden from the public ${PUBLIC_SURFACE[subject]}. Its parties can still see and complete it.`,
      }
  }
}

/**
 * The parts of a detail wire the audience derivation reads. Structural, so
 * `GigDetail` and `ExchangeDetail` both satisfy it without either importing
 * the other. Taken as ONE object rather than four id props on purpose: the
 * ids are all `string`, so a caller that swapped two of them would compile
 * cleanly and quietly show the wrong audience the wrong message.
 */
export interface TakedownEscrow {
  /** `escrows.hidden` off the detail wire. */
  hidden: boolean
  creator: { id: string }
  counterparty: { id: string } | null
  /** Pending direct invite; a party for disclosure, so they see this too. */
  assigned_counterparty_id: string | null
}

/**
 * Worked out from ids the wire already carries — creator, counterparty,
 * assignee — and never from a role. The detail routes read no role either
 * (their JWT claim can be a token lifetime stale, see server
 * lib/escrow-detail-scope.ts), so "not a party" is exactly the reader those
 * routes let through on a role check: a moderator.
 */
export function takedownAudience(escrow: TakedownEscrow, viewerId: string): TakedownAudience {
  if (viewerId === escrow.creator.id) return 'owner'
  if (viewerId === escrow.counterparty?.id) return 'counterparty'
  if (viewerId === escrow.assigned_counterparty_id) return 'counterparty'
  return 'moderator'
}
