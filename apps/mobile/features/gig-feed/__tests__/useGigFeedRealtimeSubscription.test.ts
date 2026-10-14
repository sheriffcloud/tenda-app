import { act, renderHook } from '@testing-library/react-native'
import { GIG_FEED_REVISION_MEMORY, MAX_PAGINATION_LIMIT, type GigFeedServerFrame } from '@tenda/shared'
import { gigDetail } from '@/components/gig/__fixtures__/gig-detail'

let feedListener: ((frame: GigFeedServerFrame) => void) | undefined
let connectionListener: ((state: { connected: boolean }) => void) | undefined
const realtimeState = { connected: true }
jest.mock('@/stores/realtime.store', () => ({
  subscribeGigFeedChannel: (listener: (frame: GigFeedServerFrame) => void) => {
    feedListener = listener
    return () => { feedListener = undefined }
  },
  useRealtimeStore: {
    getState: () => realtimeState,
    subscribe: (listener: (state: { connected: boolean }) => void) => {
      connectionListener = listener
      return () => { connectionListener = undefined }
    },
  },
}))

import { useGigFeedRealtimeSubscription } from '../useGigFeedRealtimeSubscription'

function available(): GigFeedServerFrame {
  const gig = gigDetail({ escrow_id: 'new-gig', created_at: '2026-08-13T10:00:00.000Z' })
  return {
    channel: 'feed:gigs',
    type: 'gig_available',
    event_id: 'event-1',
    escrow_id: gig.escrow_id,
    gig_revision: '1',
    occurred_at: '2026-08-13T10:00:00.000Z',
    gig,
  }
}

/** A full server page of rows (the cap the memory itself is derived from), so a render makes every previous row depart at once. */
function page(prefix: string): ReturnType<typeof gigDetail>[] {
  return Array.from({ length: MAX_PAGINATION_LIMIT }, (_, i) => gigDetail({ escrow_id: `${prefix}-${i}`, public_feed_revision: '1' }))
}

/** A frame for `first` at a revision BELOW the 7 it was seen at — stale if remembered, new if forgotten. */
function staleFrameForFirst(first: ReturnType<typeof gigDetail>): GigFeedServerFrame {
  const stale = available()
  if (stale.type === 'gig_available') {
    stale.escrow_id = 'first'
    stale.gig = { ...first, title: 'Stale' }
    stale.gig_revision = '6'
  }
  return stale
}

test('applies a matchable available event without HTTP reconciliation', () => {
  const target = {
    items: [],
    applyRealtimeItems: jest.fn(),
    reconcile: jest.fn(async () => true),
  }
  renderHook(() => useGigFeedRealtimeSubscription(target, {}))
  act(() => feedListener?.(available()))
  expect(target.applyRealtimeItems).toHaveBeenCalledWith([
    expect.objectContaining({ escrow_id: 'new-gig' }),
  ])
  expect(target.reconcile).not.toHaveBeenCalled()
})

test('server-only search reconciles instead of approximating a match', () => {
  const target = {
    items: [],
    applyRealtimeItems: jest.fn(),
    reconcile: jest.fn(async () => true),
  }
  renderHook(() => useGigFeedRealtimeSubscription(target, { q: 'paint' }))
  act(() => feedListener?.(available()))
  expect(target.applyRealtimeItems).not.toHaveBeenCalled()
  expect(target.reconcile).toHaveBeenCalledTimes(1)
})

test('server-owned proximity and amount ordering reconcile instead of drifting', () => {
  for (const query of [
    { lat: 6.5, lng: 3.3, radius_km: 10 },
    { sort: 'amount_desc' as const },
  ]) {
    const target = {
      items: [],
      applyRealtimeItems: jest.fn(),
      reconcile: jest.fn(async () => true),
    }
    const { unmount } = renderHook(() => useGigFeedRealtimeSubscription(target, query))
    act(() => feedListener?.(available()))
    expect(target.applyRealtimeItems).not.toHaveBeenCalled()
    expect(target.reconcile).toHaveBeenCalledTimes(1)
    unmount()
  }
})

test('an event older than the HTTP snapshot revision cannot overwrite it', () => {
  const current = gigDetail({ public_feed_revision: '5', title: 'Current' })
  const target = {
    items: [current],
    applyRealtimeItems: jest.fn(),
    reconcile: jest.fn(async () => true),
  }
  renderHook(() => useGigFeedRealtimeSubscription(target, {}))
  const stale = available()
  if (stale.type === 'gig_available') {
    stale.escrow_id = current.escrow_id
    stale.gig = { ...current, title: 'Stale' }
    stale.gig_revision = '4'
  }
  act(() => feedListener?.(stale))
  expect(target.applyRealtimeItems).not.toHaveBeenCalled()
})

test('unmount removes the feed subscription', () => {
  const target = {
    items: [],
    applyRealtimeItems: jest.fn(),
    reconcile: jest.fn(async () => true),
  }
  const { unmount } = renderHook(() => useGigFeedRealtimeSubscription(target, {}))
  unmount()
  expect(feedListener).toBeUndefined()
  expect(connectionListener).toBeUndefined()
})

test('a disconnected-to-connected transition performs one authoritative reconciliation', () => {
  realtimeState.connected = false
  const target = {
    items: [],
    applyRealtimeItems: jest.fn(),
    reconcile: jest.fn(async () => true),
  }
  renderHook(() => useGigFeedRealtimeSubscription(target, {}))
  act(() => connectionListener?.({ connected: false }))
  act(() => connectionListener?.({ connected: true }))
  act(() => connectionListener?.({ connected: true }))
  expect(target.reconcile).toHaveBeenCalledTimes(1)
  realtimeState.connected = true
})

test('bursty server-only events coalesce to one in-flight and one trailing reconciliation', async () => {
  let finishFirst: (() => void) | undefined
  const firstReload = new Promise<number>((resolve) => {
    finishFirst = () => resolve(0)
  })
  const target = {
    items: [],
    applyRealtimeItems: jest.fn(),
    reconcile: jest.fn()
      .mockReturnValueOnce(firstReload.then(() => true))
      .mockResolvedValue(true),
  }
  renderHook(() => useGigFeedRealtimeSubscription(target, { q: 'server search' }))

  act(() => {
    feedListener?.(available())
    feedListener?.(available())
    feedListener?.(available())
  })
  expect(target.reconcile).toHaveBeenCalledTimes(1)
  await act(async () => { finishFirst?.(); await firstReload })
  expect(target.reconcile).toHaveBeenCalledTimes(2)
})

test('a rejected reconciliation does not permanently block later recovery', async () => {
  const target = {
    items: [],
    applyRealtimeItems: jest.fn(),
    reconcile: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true),
  }
  renderHook(() => useGigFeedRealtimeSubscription(target, { q: 'server search' }))

  await act(async () => { feedListener?.(available()); await Promise.resolve() })
  await act(async () => { feedListener?.(available()); await Promise.resolve() })
  expect(target.reconcile).toHaveBeenCalledTimes(2)
})

test('#73: the seeded revision memory is bounded across renders — a long-departed row is no longer guarded', () => {
  const first = gigDetail({ escrow_id: 'first', public_feed_revision: '7', title: 'Current' })
  const target = {
    items: [first],
    applyRealtimeItems: jest.fn(),
    reconcile: jest.fn(async () => true),
  }
  const { rerender } = renderHook(({ t }: { t: typeof target }) => useGigFeedRealtimeSubscription(t, {}), {
    initialProps: { t: target },
  })
  // More departures than the memory, page by page; `first` left on the first turn.
  const pages = Math.ceil((GIG_FEED_REVISION_MEMORY + 1) / MAX_PAGINATION_LIMIT) + 1
  for (let p = 0; p < pages; p += 1) rerender({ t: { ...target, items: page(`p${p}`) } })
  act(() => feedListener?.(staleFrameForFirst(first)))
  // Forgotten, so the old frame is applied as new — the reducer's stated trade,
  // and the proof the map did not keep every gig the session ever saw.
  expect(target.applyRealtimeItems).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ escrow_id: 'first', title: 'Stale' })]))
})

test('#73: a row that departed RECENTLY is still guarded — the memory is a memory, not a reset', () => {
  // The other half of the bound. Without it, a hook that forgot every
  // departure at once (memory 0) passed the case above and replayed every
  // late frame for a row that had just scrolled off as new. MEASURED.
  const first = gigDetail({ escrow_id: 'first', public_feed_revision: '7', title: 'Current' })
  const target = {
    items: [first],
    applyRealtimeItems: jest.fn(),
    reconcile: jest.fn(async () => true),
  }
  const { rerender } = renderHook(({ t }: { t: typeof target }) => useGigFeedRealtimeSubscription(t, {}), {
    initialProps: { t: target },
  })
  // `first` departs, and fewer than the memory follow it out.
  rerender({ t: { ...target, items: page('a') } })
  rerender({ t: { ...target, items: page('b') } })
  act(() => feedListener?.(staleFrameForFirst(first)))
  // Still remembered at 7, so a frame at 6 is stale: nothing applied, nothing asked.
  expect(target.applyRealtimeItems).not.toHaveBeenCalled()
  expect(target.reconcile).not.toHaveBeenCalled()
})

