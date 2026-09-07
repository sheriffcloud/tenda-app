import type { GigListQuery } from '../types/gig'
import { isAmountRaw } from '../utils/amount-raw'

export type GigFeedQueryClassification = 'client_matchable' | 'server_reconciliation_required'

/** Query shapes whose membership or ordering is authoritative on the server. */
export function classifyGigFeedQuery(query: GigListQuery): GigFeedQueryClassification {
  const hasSearch = query.q !== undefined && query.q.trim() !== ''
  const hasProximity =
    query.lat !== undefined || query.lng !== undefined || query.radius_km !== undefined
  const hasServerOrdering = query.sort === 'amount_asc' || query.sort === 'amount_desc'
  const isPrivateFeed = query.mine !== undefined || query.status !== undefined
  const hasInvalidAmount =
    (query.min_amount_raw !== undefined && !isAmountRaw(query.min_amount_raw)) ||
    (query.max_amount_raw !== undefined && !isAmountRaw(query.max_amount_raw))
  return hasSearch || hasProximity || hasServerOrdering || isPrivateFeed || hasInvalidAmount
    ? 'server_reconciliation_required'
    : 'client_matchable'
}
