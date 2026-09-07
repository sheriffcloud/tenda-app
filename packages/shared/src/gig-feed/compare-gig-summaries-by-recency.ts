import type { GigSummary } from '../types/gig'

/** Mirrors `created_at DESC, escrow_id DESC`; null timestamps sort last. */
export function compareGigSummariesByRecency(left: GigSummary, right: GigSummary): number {
  const leftCreatedAt = left.created_at ?? ''
  const rightCreatedAt = right.created_at ?? ''
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt > rightCreatedAt ? -1 : 1
  if (left.escrow_id === right.escrow_id) return 0
  return left.escrow_id > right.escrow_id ? -1 : 1
}
