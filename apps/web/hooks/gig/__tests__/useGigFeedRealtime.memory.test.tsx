/**
 * The hook's revision memory is bounded (#73) at BOTH places it grows: the
 * per-render seed (the first two cases) and the reconcile branch (the third,
 * under a server-only query, where the hook records a revision without ever
 * changing the rows). The reducer bounds its own path; these are the two the
 * hook owns. Observed through behaviour, not the ref: a stale frame for a
 * departed row is refused while remembered and accepted once forgotten — the
 * stated trade, pinned here so a future "remember everything" cannot creep
 * back. MEASURED: with the reconcile-branch prune removed the first two cases
 * stayed green, which is why the third exists.
 */
import { act, render, screen } from '@testing-library/react'
import { useLayoutEffect, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { GIG_FEED_REVISION_MEMORY, MAX_PAGINATION_LIMIT, type GigFeedServerFrame, type GigListQuery, type GigSummary } from '@tenda/shared'
import { frameFor, gig } from '@/hooks/gig/__fixtures__/gig-feed-frames'

const seams = vi.hoisted(() => ({
  listener: null as ((event: GigFeedServerFrame) => void) | null,
}))
vi.mock('@/stores/realtime.store', () => ({
  useRealtimeStore: (select: (state: { connected: boolean }) => boolean) => select({ connected: true }),
  subscribeGigFeedChannel: (listener: (event: GigFeedServerFrame) => void) => {
    seams.listener = listener
    return () => {
      seams.listener = null
    }
  },
}))

import { useGigFeedRealtime } from '@/hooks/gig/useGigFeedRealtime'

function Harness({
  items,
  frame,
  query = {},
  onReconcile = () => {},
}: {
  items: readonly GigSummary[]
  frame?: GigFeedServerFrame
  query?: GigListQuery
  onReconcile?: () => void
}) {
  const [applied, setApplied] = useState<readonly GigSummary[] | null>(null)
  const rows = applied ?? items
  useGigFeedRealtime<GigSummary>({
    items: rows,
    query,
    project: (g) => g,
    applyItems: (next) => setApplied(next),
    onReconcile,
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

const FIRST = gig('first', '7', 'First, current at revision 7')
const page = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => gig(`${prefix}-${i}`, '1', `${prefix} ${i}`))

describe('useGigFeedRealtime revision memory (#73)', () => {
  it('a departed row is still guarded while it is among the remembered departures', () => {
    const { rerender } = render(<Harness items={[FIRST]} />)
    // FIRST departs; fewer than the memory follow it out.
    rerender(<Harness items={page(10, 'a')} />)
    rerender(<Harness items={page(10, 'b')} />)
    rerender(<Harness items={page(10, 'b')} frame={frameFor(gig('first', '6', 'First, stale at 6'), '6')} />)
    expect(screen.queryByText('First, stale at 6')).not.toBeInTheDocument()
  })

  it('once more than the memory have departed after it, the same stale frame reads as new — the stated trade', () => {
    const { rerender } = render(<Harness items={[FIRST]} />)
    // Enough churn to push FIRST out of memory: a full server page (the cap
    // the memory is derived from) departs entirely on every render.
    const pages = Math.ceil((GIG_FEED_REVISION_MEMORY + 1) / MAX_PAGINATION_LIMIT) + 1
    for (let p = 0; p < pages; p += 1) rerender(<Harness items={page(MAX_PAGINATION_LIMIT, `p${p}`)} />)
    rerender(<Harness items={page(MAX_PAGINATION_LIMIT, 'last')} frame={frameFor(gig('first', '6', 'First, stale at 6'), '6')} />)
    expect(screen.getByText('First, stale at 6')).toBeInTheDocument()
  })

  it('the reconcile branch remembers a frame\'s revision, and forgets it past the memory, the same way', () => {
    // A server-only query: every available frame is the server's to place, so
    // the hook records the revision and asks for a reconcile. The record is
    // observable as the one thing it changes — a stale frame for a remembered
    // row asks for NOTHING, and the same frame asks again once forgotten.
    const onReconcile = vi.fn()
    render(<Harness items={[]} query={{ q: 'paint' }} onReconcile={onReconcile} />)
    const send = (frame: GigFeedServerFrame) => act(() => seams.listener?.(frame))
    send(frameFor(FIRST, '7'))
    expect(onReconcile).toHaveBeenCalledTimes(1)
    send(frameFor(FIRST, '6'))
    expect(onReconcile).toHaveBeenCalledTimes(1)
    // More distinct rows than the memory, each recorded through the same branch.
    const others = page(GIG_FEED_REVISION_MEMORY + 1, 'other')
    for (const other of others) send(frameFor(other, '1'))
    expect(onReconcile).toHaveBeenCalledTimes(1 + others.length)
    send(frameFor(FIRST, '6'))
    expect(onReconcile).toHaveBeenCalledTimes(2 + others.length)
  })
})
