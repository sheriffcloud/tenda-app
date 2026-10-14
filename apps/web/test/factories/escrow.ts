/**
 * Kind-agnostic escrow satellite rows for tests. `Dispute` is an escrow-level
 * shape — the wire serves the same row on the gig AND exchange details — so
 * its builder lives beside the other cross-surface factories rather than in
 * either domain's fixtures.
 */
import type { Dispute } from '@tenda/shared'

/** A dispute row as the wire serves a PARTY — resolved escrows KEEP the row
 *  (resolution stamps `winner`/`resolved_at`, it never deletes), which is why
 *  every dispute banner gates on the escrow's status as well. */
export function disputeRow(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: 'd1',
    escrow_id: 'escrow-1',
    raised_by: 'user-creator',
    reason: 'Package never arrived',
    assigned_to: null,
    assigned_at: null,
    winner: null,
    resolved_by: null,
    resolved_at: null,
    created_at: new Date('2026-08-11T00:00:00.000Z'),
    ...overrides,
  }
}
