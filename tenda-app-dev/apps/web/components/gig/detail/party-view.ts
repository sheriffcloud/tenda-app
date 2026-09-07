import type { GigDetail, UserRef } from '@tenda/shared'
import { GIG_DETAIL_COPY } from './copy'

/**
 * The OTHER party from this viewer's seat, with mobile's role label — the
 * creator sees the Worker, everyone else party-side sees the poster. One
 * source (spec-correction #51): PartyPanel and the workspace dossier both
 * draw this card, and each encoding the ternary is how the two drift.
 */
export function gigCounterpartyView(
  gig: GigDetail,
  userId: string,
): { user: UserRef; label: string } | null {
  if (gig.counterparty === null) return null
  return userId === gig.creator.id
    ? { user: gig.counterparty, label: GIG_DETAIL_COPY.worker }
    : { user: gig.creator, label: GIG_DETAIL_COPY.postedBy }
}
