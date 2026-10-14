/**
 * Gig full-text search helpers (S5.3, closes open #25). The tsvector
 * GENERATED column + GIN index live on v2 `gig_details`; these builders
 * are consumed by the v2 listing route (cutover §3 rewrite), defined now
 * so the rewrite and any admin search share one implementation.
 *
 * `plainto_tsquery` parses raw user input safely (no tsquery syntax is
 * interpreted), no manual escaping needed or wanted.
 */

import { sql, type SQL } from 'drizzle-orm'
import { gig_details } from '@tenda/shared/db/schema/escrow'

export function gigSearchCondition(q: string): SQL {
  return sql`${gig_details.search_vector} @@ plainto_tsquery('english', ${q})`
}

/** ORDER BY this DESC for relevance-ordered results (title outranks body). */
export function gigSearchRank(q: string): SQL {
  return sql`ts_rank(${gig_details.search_vector}, plainto_tsquery('english', ${q}))`
}
