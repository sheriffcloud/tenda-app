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
 * Copy lives apart from the component (same split as
 * components/escrow/tx-action/copy.ts) so the wording is reviewable as prose
 * and testable without rendering.
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
