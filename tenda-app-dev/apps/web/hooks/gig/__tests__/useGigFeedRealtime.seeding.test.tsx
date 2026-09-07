/**
 * The seeding window (#46): what `useGigFeedRealtime` knows at the instant a
 * frame arrives.
 *
 * The hook mirrors each render's rows and revisions into refs, because the
 * `feed:gigs` listener runs OUTSIDE React and can fire at any moment. Whether
 * that mirroring happens in a passive effect or a layout effect is invisible
 * almost always — and decides correctness in the gap between a commit and the
 * scheduler catching up, where a frame reads the PREVIOUS render.
 *
 * That gap is not hypothetical. `applyGigFeedEvent` only refuses a superseded
 * frame for a revision it already holds, so an unseeded map has no staleness
 * guard at all: the stale frame is applied and the row shows old data. The
 * OpenGigsListColumn live suite lost this race roughly one run in ten, on
 * whichever of its tests happened to hit it; deferring the seed by one
 * macrotask reproduced every symptom it had ever shown at once.
 *
 * These specs make that deterministic by delivering the frame inside the same
 * synchronous `act` as the commit — the point where passive effects are still
 * held back and layout effects have already run.
 */
import { render, screen } from '@testing-library/react'
import { useLayoutEffect, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { GigFeedServerFrame, GigSummary } from '@tenda/shared'
import { deliveryGig } from '@/e2e/fixtures/gigs'

const seams = vi.hoisted(() => ({
  listener: null as ((event: GigFeedServerFrame) => void) | null,
}))
vi.mock('@/stores/realtime.store', () => ({
  useRealtimeStore: (select: (state: { connected: boolean }) => boolean) =>
    select({ connected: true }),
  subscribeGigFeedChannel: (listener: (event: GigFeedServerFrame) => void) => {
    seams.listener = listener
    return () => {
      seams.listener = null
    }
  },
}))

import { useGigFeedRealtime } from '@/hooks/gig/useGigFeedRealtime'

function gig(id: string, revision: string, title: string): GigSummary {
  return { ...deliveryGig, escrow_id: id, public_feed_revision: revision, title }
}

function frameFor(item: GigSummary, revision: string): GigFeedServerFrame {
  return {
    type: 'gig_available',
    channel: 'feed:gigs',
    event_id: `event-${revision}`,
    escrow_id: item.escrow_id,
    gig_revision: revision,
    occurred_at: '2026-08-25T00:00:00.000Z',
    gig: { ...item, public_feed_revision: revision },
  }
}

/**
 * Fires `frame` from the harness's OWN layout effect.
 *
 * That is what makes these specs deterministic rather than another race.
 * Layout effects run in declaration order inside the commit and
 * `useGigFeedRealtime` is called first, so a LAYOUT seed has already happened
 * when this fires and a PASSIVE one has not — which is exactly the window the
 * production bug lived in, entered on purpose, every run.
 *
 * The frame must ride a LATER commit, never the mount: the hook subscribes in a
 * passive effect, so at mount-layout time there is no listener yet and the frame
 * goes nowhere. An earlier draft of these specs did that and "passed" against a
 * no-op — the two siblings failing beside it are what gave it away.
 */
function Harness({
  items,
  frame,
}: {
  items: readonly GigSummary[]
  frame?: GigFeedServerFrame
}) {
  const [applied, setApplied] = useState<readonly GigSummary[] | null>(null)
  const rows = applied ?? items
  useGigFeedRealtime<GigSummary>({
    items: rows,
    query: {},
    project: (g) => g,
    applyItems: (next) => setApplied(next),
    onReconcile: () => {},
  })
  useLayoutEffect(() => {
    if (frame !== undefined) seams.listener?.(frame)
  }, [frame])
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.escrow_id}>{row.title}</li>
      ))}
    </ul>
  )
}

const CURRENT = gig('gig-a', '7', 'Current title')

/** Mount empty (so the hook subscribes), then commit rows and a frame together. */
function renderThenCommit(frame: GigFeedServerFrame): void {
  const { rerender } = render(<Harness items={[]} />)
  expect(seams.listener, 'the hook must be subscribed before the frame is sent').not.toBeNull()
  rerender(<Harness items={[CURRENT]} frame={frame} />)
}

describe('useGigFeedRealtime seeding', () => {
  it('refuses a superseded frame that arrives the instant the rows commit', () => {
    renderThenCommit(frameFor(gig('gig-a', '6', 'Stale title'), '6'))

    // `applyGigFeedEvent` only refuses a revision it already holds, so an
    // unseeded map has no staleness check at all and this frame is applied.
    expect(screen.getByText('Current title')).toBeInTheDocument()
    expect(screen.queryByText('Stale title')).not.toBeInTheDocument()
  })

  it('keeps the rows it just committed when a NEW gig arrives in that instant', () => {
    // The other half of a stale seed: the reducer builds on the rows it can
    // see, so an unseeded list is rebuilt from the previous one — here the
    // empty mount — and the row that just committed is dropped.
    renderThenCommit(frameFor(gig('gig-b', '1', 'Brand new'), '1'))

    expect(screen.getByText('Brand new')).toBeInTheDocument()
    expect(screen.getByText('Current title')).toBeInTheDocument()
  })

  it('still accepts a genuinely newer frame for a row it has seeded', () => {
    // The guard must refuse the old and admit the new — a hook that ignored
    // everything would pass both specs above.
    renderThenCommit(frameFor(gig('gig-a', '8', 'Newer title'), '8'))

    expect(screen.getByText('Newer title')).toBeInTheDocument()
    expect(screen.queryByText('Current title')).not.toBeInTheDocument()
  })
})
