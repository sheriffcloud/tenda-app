import { gigPlaceLabel, type GigSummary } from '@tenda/shared'
import { ChainBadge } from '@/components/shared/ChainBadge'

/**
 * The row's second line: where the gig is, and which chain holds the money.
 *
 * The comp writes something richer here — `applicants` if any, else the
 * counterparty's name, else the place. **Neither of the first two is on the
 * wire.** `GigSummary` has no applicant count and no counterparty (only
 * `assigned_counterparty_id`, which is party-scoped and an ID, not a name), so
 * "4 applicants" beside a real gig would be a number this app invented — the
 * same call as spec-correction #13.
 *
 * What is left is true and useful: the shared place label (never a bare
 * country code, never "Anywhere" for a gig nobody gave a location) and the
 * chain — drawn as the shared ChainBadge since #60, so the network reads the
 * same on a row as on a card.
 */
export function GigRowSubtitle({ gig }: { gig: GigSummary }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="min-w-0 truncate">{gigPlaceLabel(gig)}</span>
      <span aria-hidden>·</span>
      <ChainBadge chainId={gig.chain_id} size="sm" />
    </span>
  )
}
