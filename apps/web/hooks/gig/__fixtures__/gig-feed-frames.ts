/**
 * Rows and `feed:gigs` frames for the useGigFeedRealtime suites (seeding,
 * memory). Data only, the way `components/gig/__fixtures__` shares the wizard's
 * — the `vi.mock` seams stay in each file, where vitest hoists them.
 *
 * Shared because the two suites had carried these verbatim: a frame builder
 * that changed shape in one (a per-row `event_id`, so a flood of rows is not a
 * flood of duplicates) silently left the other on the old one.
 */
import type { GigFeedServerFrame, GigSummary } from '@tenda/shared'
import { deliveryGig } from '@/e2e/fixtures/gigs'

/** A feed row: the delivery fixture under another id, revision and title. */
export function gig(id: string, revision: string, title: string): GigSummary {
  return { ...deliveryGig, escrow_id: id, public_feed_revision: revision, title }
}

/**
 * A `gig_available` frame carrying `item` at `revision`. The `event_id` is
 * unique per row AND revision: the reducer refuses a repeated event id as a
 * duplicate, so a builder keyed on the revision alone makes every second row
 * at revision '1' vanish as a replay.
 */
export function frameFor(item: GigSummary, revision: string): GigFeedServerFrame {
  return {
    type: 'gig_available',
    channel: 'feed:gigs',
    event_id: `event-${item.escrow_id}-${revision}`,
    escrow_id: item.escrow_id,
    gig_revision: revision,
    occurred_at: '2026-08-25T00:00:00.000Z',
    gig: { ...item, public_feed_revision: revision },
  }
}
