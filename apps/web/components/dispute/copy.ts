/**
 * The disputes column's strings and its two URL helpers.
 *
 * The helpers live beside the copy because the bucket is a URL fact: the column
 * reads it from `?status=`, the tabs write it, and every row href carries it
 * forward so the list still shows the bucket the reader opened a dispute from.
 * Three call sites, one definition — a hand-built query string in any of them
 * is how a "Resolved" list quietly snaps back to "Open".
 */
import { winnerLabel, type EscrowKind, type MyDisputeRow, type MyDisputeStatus } from '@tenda/shared'

const BUCKETS: readonly MyDisputeStatus[] = ['open', 'resolved']

/** A `?status=` value narrowed to the two the API takes; anything else is Open. */
export function disputeBucket(raw: string | null): MyDisputeStatus {
  return BUCKETS.find((bucket) => bucket === raw) ?? 'open'
}

export function disputesHref(status: MyDisputeStatus): string {
  // The default bucket is left OFF the URL: /disputes and /disputes?status=open
  // are the same view, and only one of them should be linkable.
  return status === 'open' ? '/disputes' : `/disputes?status=${status}`
}

export function disputeThreadHref(escrowId: string, status: MyDisputeStatus): string {
  return status === 'open' ? `/dispute/${escrowId}` : `/dispute/${escrowId}?status=${status}`
}

export const DISPUTES_LIST_COPY = {
  surface: (status: MyDisputeStatus) => ({
    title: 'Disputes',
    emptyTitle: status === 'open' ? 'No open disputes' : 'No resolved disputes',
    emptyBody:
      status === 'open'
        ? 'Disputes you raise, or that are raised against you, appear here.'
        : 'Once a dispute is settled it moves here for your records.',
  }),
  tabs: [
    { key: 'open' as const, label: 'Open' },
    { key: 'resolved' as const, label: 'Resolved' },
  ],
  count: (total: number, status: MyDisputeStatus) =>
    `${total} ${status === 'open' ? 'open' : 'resolved'}`,
  loadMore: 'Load more',
  loadingMore: 'Loading…',
  /** An exchange has no title of its own; a gig always does. */
  untitled: (kind: EscrowKind) => (kind === 'gig' ? 'Gig' : 'Currency exchange'),
  /**
   * Who it is with, then the fact that matters for this bucket. While a
   * dispute is open that is who raised it; once it is settled the OUTCOME is
   * the only reason to look at the row at all, so it takes the slot.
   */
  subtitle: (row: MyDisputeRow) => {
    const withWhom = row.counterparty_name ?? 'the other party'
    if (row.resolved_at !== null && row.winner !== null) {
      return `${withWhom} · Outcome: ${winnerLabel(row.kind, row.winner)}`
    }
    return `${withWhom} · ${row.raised_by_me ? 'You raised this' : 'Raised against you'}`
  },
  emptyDetailTitle: 'Pick a dispute',
  emptyDetailBody:
    'A dispute thread is shared with the other party and the mediator — everything posted in it is read by all three.',
} as const
