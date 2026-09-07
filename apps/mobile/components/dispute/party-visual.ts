/**
 * The one role→colour mapping for dispute surfaces. It was an inline ternary
 * in the context header; the mediation bubbles now need the SAME answer, and
 * two independent ternaries is exactly how the header and the thread would
 * drift into calling the poster orange in one place and blue in the other.
 *
 * The value is a THEME COLOUR KEY, which is what lets both consumers use it
 * without a second mapping: the header hands it to Avatar's `tone`, the
 * bubble reads `theme.colors[partyAccent(role)].primary` for its role stripe.
 */
import type { PartyRole } from '@tenda/shared'
import type { AvatarGradient } from '@/components/ui/Avatar'

/** Both members are keys of `theme.colors` AND valid Avatar tones/gradients. */
const ROLE_ACCENTS: Readonly<Record<PartyRole, AvatarGradient>> = {
  creator: 'accent',
  counterparty: 'brand',
}

export function partyAccent(role: PartyRole): AvatarGradient {
  return ROLE_ACCENTS[role]
}
