import type { GigSummary } from '../types/gig'

export type GigFeedRecencyFields = Pick<GigSummary, 'created_at' | 'escrow_id'>

/**
 * Mirrors `created_at DESC, escrow_id DESC`.
 *
 * No null handling: `escrows.created_at` is NOT NULL and every producer emits
 * an ISO string, so both operands are always comparable — see `GigSummary`.
 * ISO-8601 UTC strings sort lexicographically in the same order as the
 * instants they name, which is why this compares them as text.
 */
export function compareGigSummariesByRecency(
  left: GigFeedRecencyFields,
  right: GigFeedRecencyFields,
): number {
  if (left.created_at !== right.created_at) return left.created_at > right.created_at ? -1 : 1
  if (left.escrow_id === right.escrow_id) return 0
  return left.escrow_id > right.escrow_id ? -1 : 1
}
