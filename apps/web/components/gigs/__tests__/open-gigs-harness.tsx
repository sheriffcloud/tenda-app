/**
 * Shared fixtures for the OpenGigsListColumn suites. Not a *.test file, so
 * vitest does not collect it — it only supplies what the static and live specs
 * both need. Same shape as `list-harness.tsx` beside ListColumn.
 *
 * The `vi.mock` blocks stay in each spec: vitest hoists them per file, so they
 * cannot live here. That is the duplication the realtime.store trio already
 * accepts for the same reason.
 */
import { act, screen } from '@testing-library/react'
import type { GigFeedServerFrame, GigSummary } from '@tenda/shared'
import { deliveryGig } from '@/e2e/fixtures/gigs'

export function otherGig(id: string, revision: string, title: string, created_at?: string): GigSummary {
  return {
    ...deliveryGig,
    escrow_id: id,
    public_feed_revision: revision,
    title,
    ...(created_at !== undefined ? { created_at } : {}),
  }
}

/** The rendered row order, read off the hrefs the column emits. */
export function renderedGigIds(): string[] {
  return screen
    .getAllByRole('link')
    .map((row) => row.getAttribute('href') ?? '')
    .filter((href) => href.startsWith('/gigs/'))
    .map((href) => href.replace('/gigs/', ''))
}

export function available(item: GigSummary, revision: string): GigFeedServerFrame {
  return {
    type: 'gig_available', channel: 'feed:gigs', event_id: `event-${revision}`,
    escrow_id: item.escrow_id, gig_revision: revision,
    occurred_at: '2026-08-25T00:00:00.000Z',
    gig: { ...item, public_feed_revision: revision },
  }
}

export function unavailable(id: string, revision: string): GigFeedServerFrame {
  return {
    type: 'gig_unavailable', channel: 'feed:gigs', event_id: `event-${revision}`,
    escrow_id: id, gig_revision: revision,
    occurred_at: '2026-08-25T00:00:00.000Z', cause: 'accepted',
  }
}

/** Push a frame the way the socket would. Pass the spec's own listener seam. */
export function broadcastVia(
  listener: ((event: GigFeedServerFrame) => void) | null,
  frame: GigFeedServerFrame,
) {
  act(() => { listener?.(frame) })
}
