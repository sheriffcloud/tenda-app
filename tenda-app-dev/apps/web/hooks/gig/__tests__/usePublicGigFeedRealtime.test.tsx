import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GigFeedServerFrame, GigListQuery, GigSummary } from '@tenda/shared'

const seams = vi.hoisted(() => ({
  listener: null as ((event: GigFeedServerFrame) => void) | null,
  refresh: vi.fn(),
  connected: true,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: seams.refresh }) }))
vi.mock('@/hooks/connectivity/useRealtimeConnection', () => ({ useRealtimeConnection: vi.fn() }))
vi.mock('@/stores/realtime.store', () => ({
  useRealtimeStore: (select: (state: { connected: boolean }) => boolean) => select({ connected: seams.connected }),
  subscribeGigFeedChannel: (listener: (event: GigFeedServerFrame) => void) => {
    seams.listener = listener
    return () => { seams.listener = null }
  },
}))

import { usePublicGigFeedRealtime } from '@/hooks/gig/usePublicGigFeedRealtime'
import { useAuthStore } from '@/stores/auth.store'
import { toGigCardModel } from '@/components/gig/feed/gig-card-model'

function gig(id: string, revision = '1'): GigSummary {
  return {
    escrow_id: id,
    public_feed_revision: revision,
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '1000000',
    status: 'open',
    accept_deadline: null,
    created_at: '2026-08-23T00:00:00.000Z',
    title: `Gig ${id}`,
    description: null,
    category: 'delivery',
    country: 'NG',
    city: 'Lagos',
    latitude: null,
    longitude: null,
    remote: false,
    cross_border: false,
    proof_requirements: [],
    proof_params: null,
    requires_approval: false,
    creator: {
      id: 'creator', first_name: 'Ada', last_name: 'Lovelace', avatar_url: null,
      country: 'NG', is_seeker: false, is_agent: false, review_score: null,
    },
  }
}

function available(item: GigSummary, revision: string): GigFeedServerFrame {
  return {
    type: 'gig_available', channel: 'feed:gigs', event_id: `event-${revision}`,
    escrow_id: item.escrow_id, gig_revision: revision,
    occurred_at: '2026-08-23T00:00:00.000Z',
    gig: { ...item, public_feed_revision: revision },
  }
}

function unavailable(id: string, revision: string): GigFeedServerFrame {
  return {
    type: 'gig_unavailable', channel: 'feed:gigs', event_id: `event-${revision}`,
    escrow_id: id, gig_revision: revision, occurred_at: '2026-08-23T00:00:00.000Z',
    cause: 'assigned',
  }
}

function mount(items: GigSummary[], query: GigListQuery = {}) {
  const applyItems = vi.fn()
  const rendered = renderHook(() => usePublicGigFeedRealtime({
    items: items.map(toGigCardModel), query: { limit: 20, ...query }, applyItems,
  }))
  return { applyItems, unmount: rendered.unmount }
}

beforeEach(() => {
  vi.useFakeTimers()
  seams.listener = null
  seams.refresh.mockClear()
  seams.connected = true
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  useAuthStore.setState({ isLoading: false, isAuthenticated: true })
})

afterEach(() => vi.useRealTimers())

it('applies available and unavailable projections immediately, then reconciles once', () => {
  const { applyItems } = mount([gig('old')])
  act(() => {
    seams.listener?.(available(gig('reopened'), '2'))
    seams.listener?.(unavailable('old', '2'))
  })
  expect(applyItems).toHaveBeenLastCalledWith(
    [expect.objectContaining({ escrow_id: 'reopened' })],
    -1,
  )
  expect(seams.refresh).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(400))
  expect(seams.refresh).toHaveBeenCalledOnce()
})

it('reports a new membership when a full first page evicts its last visible row', () => {
  const page = Array.from({ length: 20 }, (_, index) => gig(`existing-${index}`))
  const { applyItems } = mount(page)

  act(() => seams.listener?.(available({
    ...gig('newest'),
    created_at: '2026-08-24T00:00:00.000Z',
  }, '1')))

  expect(applyItems).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ escrow_id: 'newest' })]),
    1,
  )
  expect(applyItems.mock.calls[0]?.[0]).toHaveLength(20)
})

/**
 * The other half of the eviction case, and a deliberate approximation.
 *
 * A gig can REJOIN the public set carrying an OLD `created_at` — un-hiding a
 * taken-down listing does exactly that (`admin/escrows.ts` publishes
 * `available`, and `created_at` is the escrow's creation time, not the moment
 * it became public). It sorts below a full page, so the client cannot tell
 * "new to the set" from "an update to a row that was always off-page", and it
 * must not guess: the total stays put rather than counting a member twice.
 *
 * The cost is a total that can lag by one until the next reconcile. The
 * alternative — reconciling whenever an insert is evicted — would refetch on
 * nearly every frame once the set is larger than a page, which is the far
 * worse trade.
 */
it('does not move the total for a member the page has no room for', () => {
  const page = Array.from({ length: 20 }, (_, index) => gig(`existing-${index}`))
  const { applyItems } = mount(page)

  act(() => seams.listener?.(available({
    ...gig('rejoined'),
    created_at: '2020-01-01T00:00:00.000Z',
  }, '1')))

  const [items, delta] = applyItems.mock.calls[0] ?? []
  expect(delta).toBe(0)
  expect(items).toHaveLength(20)
  expect(items?.some((item: { escrow_id: string }) => item.escrow_id === 'rejoined')).toBe(false)
})

it('ignores stale and duplicate revisions without refreshing', () => {
  const { applyItems } = mount([gig('same', '5')])
  act(() => {
    seams.listener?.(available(gig('same'), '4'))
    seams.listener?.(available(gig('same'), '5'))
    vi.runAllTimers()
  })
  expect(applyItems).not.toHaveBeenCalled()
  expect(seams.refresh).not.toHaveBeenCalled()
})

it('uses server reconciliation for search and later-page insertions', () => {
  const searched = mount([], { q: 'delivery' })
  act(() => seams.listener?.(available(gig('search'), '1')))
  expect(searched.applyItems).not.toHaveBeenCalled()
  searched.unmount()

  const later = mount([], { cursor: 'next-page' })
  act(() => {
    seams.listener?.(available(gig('later'), '1'))
    vi.advanceTimersByTime(400)
  })
  expect(later.applyItems).not.toHaveBeenCalled()
  expect(seams.refresh).toHaveBeenCalledOnce()
})

it('removes a visible unavailable gig immediately even when search needs server truth', () => {
  const { applyItems } = mount([gig('matched')], { q: 'delivery' })

  act(() => seams.listener?.(unavailable('matched', '2')))

  expect(applyItems).toHaveBeenCalledWith([], -1)
})

it('unsubscribes and clears pending reconciliation on unmount', () => {
  const { unmount } = renderHook(() => usePublicGigFeedRealtime({ items: [], query: {}, applyItems: vi.fn() }))
  act(() => seams.listener?.(available(gig('new'), '1')))
  unmount()
  expect(seams.listener).toBeNull()
  act(() => vi.runAllTimers())
  expect(seams.refresh).not.toHaveBeenCalled()
})

it('keeps the bounded visible-page refresh fallback while the socket is disconnected', () => {
  seams.connected = false
  mount([])
  act(() => {
    vi.advanceTimersByTime(15_000)
    vi.runOnlyPendingTimers()
  })
  expect(seams.refresh).toHaveBeenCalledOnce()
})


/**
 * The public feed is the one surface a SIGNED-IN reader reaches without the
 * workspace layout, so it loads the session itself — and that is what decides
 * whether they get live frames or the 15s polling fallback. Only when the
 * session has not resolved yet: re-asking on every mount would be a request
 * per navigation.
 */
it('loads the session when it has not resolved, and not when it has', () => {
  const loadSession = vi.fn(() => Promise.resolve())
  useAuthStore.setState({ isLoading: true, isAuthenticated: false, loadSession })
  const first = mount([gig('a')])
  expect(loadSession).toHaveBeenCalledTimes(1)
  first.unmount()

  loadSession.mockClear()
  useAuthStore.setState({ isLoading: false, isAuthenticated: true, loadSession })
  mount([gig('b')])
  expect(loadSession).not.toHaveBeenCalled()
})


/**
 * Two behaviours the hook documents and nothing asserted — found by mutating
 * each away and watching the suite stay green. Both lines were EXECUTED by the
 * tests above (coverage read 100%), which is exactly the difference between a
 * covered line and a verified one.
 */
it('records the revision of a frame it DECLINED, so the same frame cannot order a second reconcile', () => {
  // A search query is server-authoritative, so every available frame takes the
  // decline branch. The reducer leaves state untouched when it declines, so if
  // the hook did not record the revision itself, a redelivered frame would
  // order a fresh refresh for ever.
  mount([gig('a')], { q: 'deliver' })

  act(() => { seams.listener?.(available(gig('b'), '3')); vi.runAllTimers() })
  expect(seams.refresh).toHaveBeenCalledTimes(1)

  act(() => { seams.listener?.(available(gig('b'), '3')); vi.runAllTimers() })
  expect(seams.refresh).toHaveBeenCalledTimes(1)
})

it('keeps the revision of a row the server has since dropped, so its late frame is not new', () => {
  // Revisions ACCUMULATE across renders while items come from the render. A
  // row that leaves the page still has a version worth remembering: seeding
  // revisions from the current rows alone would make a redelivered frame for
  // the departed row look like news and put it back.
  const applyItems = vi.fn()
  const { rerender } = renderHook(
    ({ items }: { items: GigSummary[] }) => usePublicGigFeedRealtime({
      items: items.map(toGigCardModel), query: { limit: 20 }, applyItems,
    }),
    { initialProps: { items: [gig('a', '5')] } },
  )

  act(() => { seams.listener?.(unavailable('a', '6')); vi.runAllTimers() })
  expect(applyItems).toHaveBeenCalledTimes(1)

  // The page re-renders without the row, as the server now describes it.
  rerender({ items: [] })

  act(() => { seams.listener?.(unavailable('a', '6')); vi.runAllTimers() })
  expect(applyItems).toHaveBeenCalledTimes(1)
})
