import type { GigListQuery, GigSummary } from '../types/gig'

export function matchesGigFeedQuery(gig: GigSummary, query: GigListQuery): boolean {
  if (query.category !== undefined && gig.category !== query.category) return false
  if (query.country !== undefined && gig.country !== query.country) return false
  if (query.city !== undefined && gig.city !== query.city) return false
  if (query.remote !== undefined && gig.remote !== query.remote) return false
  if (query.cross_border !== undefined && gig.cross_border !== query.cross_border) return false
  if (query.chain_id !== undefined && gig.chain_id !== query.chain_id) return false
  const amount = BigInt(gig.amount_raw)
  if (query.min_amount_raw !== undefined && amount < BigInt(query.min_amount_raw)) return false
  if (query.max_amount_raw !== undefined && amount > BigInt(query.max_amount_raw)) return false
  return true
}
