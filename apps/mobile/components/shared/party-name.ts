import { scopedName, formatFullName } from '@tenda/shared'

/**
 * A person as the cards in this folder take them.
 *
 * Two wire shapes arrive here and both have to render, so the fields are
 * optional and the SHAPE is the discriminator:
 *
 *   - a `UserRef` (gigs, buyers, reviewers) carries the two nullable name
 *     columns and nothing else;
 *   - an `ExchangePartyRef` (#175) carries no columns at all — the server
 *     already decided how much of that person this viewer may see and sends
 *     `display_name` ("Wisdom A.") plus `full_name`, which is filled only for a
 *     settled party to that escrow.
 *
 * Keeping both here means a card never re-derives an identity, and adding a
 * third shape is one branch in one function rather than an edit to every
 * component that draws a face and a name.
 */
export interface CardParty {
  first_name?: string | null
  last_name?: string | null
  /** Present ⇒ this is an exchange party and the server decided the label. */
  display_name?: string
  /** The legal name, non-null only where the server revealed it. */
  full_name?: string | null
}

/**
 * The name to print, or `''` when the person has none — the word to show
 * instead ("Anonymous", "Seller") is per-card copy, exactly as
 * `formatFullName` leaves it.
 */
export function cardPartyName(party: CardParty): string {
  const { display_name } = party
  if (display_name !== undefined) {
    return scopedName({ display_name, full_name: party.full_name ?? null })
  }
  return formatFullName(party.first_name ?? null, party.last_name ?? null)
}
