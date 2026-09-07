/**
 * The personal-list trigger: revalidate when something happens to this reader,
 * and when the socket comes back.
 *
 * Tested apart from either list because both depend on the same two behaviours
 * and the debounce is the part that would be quietly dropped if each list
 * owned it — a notification fan-out is several frames, and My Gigs answers one
 * signal with four requests.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const seams = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  connected: true,
}))
vi.mock('@/stores/realtime.store', () => ({
  useRealtimeStore: (select: (state: { connected: boolean }) => boolean) =>
    select({ connected: seams.connected }),
  onPersonalEvent: (listener: () => void) => {
    seams.listeners.add(listener)
    return () => { seams.listeners.delete(listener) }
  },
}))

import { useLiveList } from '@/hooks/workspace/useLiveList'
import { LIST_BURST_DEBOUNCE_MS, LIST_OFFLINE_POLL_MS } from '@tenda/shared'

/** What the socket does when a notification lands. */
function personalEvent() {
  act(() => { for (const listener of [...seams.listeners]) listener() })
}

beforeEach(() => {
  vi.useFakeTimers()
  seams.listeners.clear()
  seams.connected = true
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => vi.useRealTimers())

describe('on a personal event', () => {
  it('revalidates — the reason the hook exists', () => {
    const revalidate = vi.fn()
    renderHook(() => useLiveList(revalidate))
    personalEvent()
    act(() => { vi.advanceTimersByTime(LIST_BURST_DEBOUNCE_MS) })
    expect(revalidate).toHaveBeenCalledTimes(1)
  })

  it('collapses a fan-out burst into ONE revalidation', () => {
    const revalidate = vi.fn()
    renderHook(() => useLiveList(revalidate))
    personalEvent()
    personalEvent()
    personalEvent()
    act(() => { vi.advanceTimersByTime(LIST_BURST_DEBOUNCE_MS) })
    expect(revalidate).toHaveBeenCalledTimes(1)
  })

  it('does not revalidate before the debounce elapses', () => {
    const revalidate = vi.fn()
    renderHook(() => useLiveList(revalidate))
    personalEvent()
    act(() => { vi.advanceTimersByTime(LIST_BURST_DEBOUNCE_MS - 1) })
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('uses the LATEST callback, so a caller need not memoise to stay correct', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useLiveList(cb), { initialProps: { cb: first } })
    personalEvent()
    rerender({ cb: second })
    act(() => { vi.advanceTimersByTime(LIST_BURST_DEBOUNCE_MS) })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('teardown', () => {
  it('unsubscribes and drops a pending revalidation on unmount', () => {
    const revalidate = vi.fn()
    const { unmount } = renderHook(() => useLiveList(revalidate))
    expect(seams.listeners.size).toBe(1)
    personalEvent()
    unmount()
    expect(seams.listeners.size).toBe(0)
    act(() => { vi.advanceTimersByTime(LIST_BURST_DEBOUNCE_MS * 3) })
    expect(revalidate).not.toHaveBeenCalled()
  })
})

describe('the socket', () => {
  it('catches up IMMEDIATELY on reconnect, without waiting out the debounce', () => {
    const revalidate = vi.fn()
    seams.connected = false
    const { rerender } = renderHook(() => useLiveList(revalidate))
    seams.connected = true
    rerender()
    expect(revalidate).toHaveBeenCalledTimes(1)
  })

  it('falls back to the shared interval while the socket is down', () => {
    const revalidate = vi.fn()
    seams.connected = false
    renderHook(() => useLiveList(revalidate))
    act(() => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS) })
    expect(revalidate).toHaveBeenCalledTimes(1)
  })
})
