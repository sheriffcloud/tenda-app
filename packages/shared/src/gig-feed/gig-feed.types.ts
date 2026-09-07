import type { GigListQuery, GigSummary } from '../types/gig'
import type { GigFeedServerFrame } from '../api/contracts/ws.contract'

/** Client-owned feed state. Revisions are separate from the public projection. */
export interface GigFeedState {
  items: readonly GigSummary[]
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

export type GigFeedEventResult =
  | { outcome: 'applied'; state: GigFeedState }
  | { outcome: 'ignored_duplicate'; state: GigFeedState }
  | { outcome: 'ignored_stale'; state: GigFeedState }
  | { outcome: 'reconciliation_required'; reason: 'server_only_filter'; state: GigFeedState }

export interface ApplyGigFeedEventInput {
  state: GigFeedState
  event: GigFeedServerFrame
  query: GigListQuery
}
