/**
 * My Disputes' live wiring.
 *
 * Nothing on the wire carries a dispute ROW — `feed:gigs` is the public feed
 * and `escrow:<id>` needs a subscription per escrow — so a dispute raised,
 * answered or resolved reaches this reader as a notification and the bucket
 * asks the server again. Per bucket, because a resolution MOVES a row from one
 * to the other and the column mounts both.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const disputesApi = vi.hoisted(() => ({ mine: vi.fn() }))
vi.mock('@/api/client', () => ({ api: { disputes: disputesApi } }))

const realtime = vi.hoisted(() => ({ listeners: new Set<() => void>(), connected: true }))
vi.mock('@/stores/realtime.store', () => ({
  useRealtimeStore: (select: (state: { connected: boolean }) => boolean) =>
    select({ connected: realtime.connected }),
  onPersonalEvent: (listener: () => void) => {
    realtime.listeners.add(listener)
    return () => { realtime.listeners.delete(listener) }
  },
}))

import { useMyDisputes } from '@/hooks/dispute/useMyDisputes'
import { LIST_BURST_DEBOUNCE_MS, LIST_OFFLINE_POLL_MS } from '@tenda/shared'
import { disputesPageCache } from '@/lib/account-state'

function personalEvent() {
  act(() => { for (const listener of [...realtime.listeners]) listener() })
}

beforeEach(() => {
  vi.clearAllMocks()
  disputesApi.mine.mockResolvedValue({ data: [], total: 0, limit: 20, offset: 0 })
  realtime.listeners.clear()
  realtime.connected = true
  // Page zero outlives the hook by design; a leftover would hide a refetch.
  disputesPageCache.clear()
})
afterEach(() => vi.useRealTimers())

it('asks the server again when something happens to this reader', async () => {
  vi.useFakeTimers()
  renderHook(() => useMyDisputes('open'))
  // `act` rather than `waitFor`: the mount fetch resolves into React state, and
  // settling it outside act is what makes the suite print a warning.
  await act(async () => {})
  expect(disputesApi.mine).toHaveBeenCalledTimes(1)

  personalEvent()
  await act(async () => { vi.advanceTimersByTime(LIST_BURST_DEBOUNCE_MS) })

  expect(disputesApi.mine).toHaveBeenCalledTimes(2)
  // The bucket it was asked for, not a blanket refetch.
  expect(disputesApi.mine.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'open' })
})

it('refreshes BOTH buckets, so a resolved row cannot leave a stale count behind', async () => {
  vi.useFakeTimers()
  renderHook(() => {
    useMyDisputes('open')
    useMyDisputes('resolved')
  })
  await act(async () => {})
  expect(disputesApi.mine).toHaveBeenCalledTimes(2)

  personalEvent()
  await act(async () => { vi.advanceTimersByTime(LIST_BURST_DEBOUNCE_MS) })

  expect(disputesApi.mine).toHaveBeenCalledTimes(4)
  const buckets = disputesApi.mine.mock.calls.slice(-2).map(([query]) => query?.status)
  expect(new Set(buckets)).toEqual(new Set(['open', 'resolved']))
})

/**
 * The negative case, and it has to run the clock PAST the disconnected
 * fallback interval to be worth anything: advancing only a few debounce
 * periods leaves a hook that polls unconditionally looking identical to one
 * that polls only while the socket is down.
 */
it('stays quiet while the socket is up and nothing has happened', async () => {
  vi.useFakeTimers()
  renderHook(() => useMyDisputes('open'))
  // `act` rather than `waitFor`: the mount fetch resolves into React state, and
  // settling it outside act is what makes the suite print a warning.
  await act(async () => {})
  expect(disputesApi.mine).toHaveBeenCalledTimes(1)

  await act(async () => { vi.advanceTimersByTime(LIST_BURST_DEBOUNCE_MS * 5) })
  expect(disputesApi.mine).toHaveBeenCalledTimes(1)

  await act(async () => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS * 3) })
  expect(disputesApi.mine).toHaveBeenCalledTimes(1)
})
