import { act, renderHook } from '@testing-library/react-native'
import type { GigFeedServerFrame } from '@tenda/shared'
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
