import type { GigListQuery, GigSummary } from '../types/gig'
import type { GigFeedRecencyFields } from './compare-gig-summaries-by-recency'
import type { GigFeedServerFrame } from '../api/contracts/ws.contract'

/**
 * Client-owned feed state, generic over the item each surface STORES.
 *
 * Three surfaces reduce this same stream — web's anonymous feed, web's
 * signed-in open-gigs list and mobile's feed — and they cannot share one item
 * type: the anonymous feed deliberately keeps `amount_raw` out of the page it
 * ships to the browser and holds a trimmed card model, while the other two
 * render the amount and hold the whole `GigSummary`. The reduction is what
 * they share; the stored shape is not. `T` is only ever constrained by what
 * the sort needs, so a caller's model may carry as little as it likes.
 */
export interface GigFeedState<T extends GigFeedRecencyFields = GigSummary> {
  items: readonly T[]
  revisions: Readonly<Record<string, string>>
}

export type ClientMatchableGigFeedQuery = Pick<
  GigListQuery,
  | 'category'
  | 'country'
  | 'city'
  | 'remote'
  | 'cross_border'
  | 'chain_id'
  | 'min_amount_raw'
  | 'max_amount_raw'
>

export type GigFeedEventResult<T extends GigFeedRecencyFields = GigSummary> =
  | { outcome: 'applied'; state: GigFeedState<T> }
  | { outcome: 'ignored_duplicate'; state: GigFeedState<T> }
  | { outcome: 'ignored_stale'; state: GigFeedState<T> }
  | { outcome: 'reconciliation_required'; reason: 'server_only_filter'; state: GigFeedState<T> }

export interface ApplyGigFeedEventInput<T extends GigFeedRecencyFields = GigSummary> {
  state: GigFeedState<T>
  event: GigFeedServerFrame
  query: GigListQuery
  /**
   * How a frame's full `GigSummary` becomes the item this caller stores.
   * Identity for a caller that stores summaries; the page's projection for one
   * that stores less. Required rather than defaulted: a silent identity would
   * type-check only for `T = GigSummary` and mislead everyone else.
   */
  project: (gig: GigSummary) => T
}
