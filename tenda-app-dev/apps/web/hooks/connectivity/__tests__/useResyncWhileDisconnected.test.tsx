/**
 * The shared "catch up while the socket is down" policy.
 *
 * Both live surfaces depend on it, and every branch here is one a reader
 * actually hits: a dropped connection, a background tab, a page that unmounts
 * mid-poll. It is deliberately tested apart from either feed — the interval and
 * the reconnect edge are the parts that would drift if each surface owned them.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const seams = vi.hoisted(() => ({ connected: true }))
vi.mock('@/stores/realtime.store', () => ({
  useRealtimeStore: (select: (state: { connected: boolean }) => boolean) =>
    select({ connected: seams.connected }),
}))

import { LIST_OFFLINE_POLL_MS } from '@tenda/shared'
import { useResyncWhileDisconnected } from '@/hooks/connectivity/useResyncWhileDisconnected'

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
}

beforeEach(() => {
  vi.useFakeTimers()
  seams.connected = true
  setVisibility('visible')
})
afterEach(() => vi.useRealTimers())

describe('while the socket is up', () => {
  it('does not resync — the frames are already arriving', () => {
    const onResync = vi.fn()
    const { rerender } = renderHook(() => useResyncWhileDisconnected(onResync))
    rerender()
    act(() => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS * 4) })
    expect(onResync).not.toHaveBeenCalled()
  })

  it('resyncs ONCE on the reconnect edge, not on every render after it', () => {
    const onResync = vi.fn()
    seams.connected = false
    const { rerender } = renderHook(() => useResyncWhileDisconnected(onResync))
    seams.connected = true
    rerender()
    expect(onResync).toHaveBeenCalledTimes(1)
    rerender()
    rerender()
    expect(onResync).toHaveBeenCalledTimes(1)
  })
})

describe('while the socket is down', () => {
  beforeEach(() => { seams.connected = false })

  it('resyncs on the interval so a reader who never gets a socket still catches up', () => {
    const onResync = vi.fn()
    renderHook(() => useResyncWhileDisconnected(onResync))
    expect(onResync).not.toHaveBeenCalled() // no leading tick
    act(() => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS) })
    expect(onResync).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS * 2) })
    expect(onResync).toHaveBeenCalledTimes(3)
  })

  it('spends nothing on a background tab', () => {
    const onResync = vi.fn()
    setVisibility('hidden')
    renderHook(() => useResyncWhileDisconnected(onResync))
    act(() => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS * 5) })
    expect(onResync).not.toHaveBeenCalled()
  })

  it('picks up a tab that becomes visible again without a remount', () => {
    const onResync = vi.fn()
    setVisibility('hidden')
    renderHook(() => useResyncWhileDisconnected(onResync))
    act(() => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS) })
    expect(onResync).not.toHaveBeenCalled()
    setVisibility('visible')
    act(() => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS) })
    expect(onResync).toHaveBeenCalledTimes(1)
  })

  it('calls the LATEST callback, so a caller need not memoise to stay correct', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useResyncWhileDisconnected(cb), {
      initialProps: { cb: first },
    })
    rerender({ cb: second })
    act(() => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS) })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops polling once unmounted', () => {
    const onResync = vi.fn()
    const { unmount } = renderHook(() => useResyncWhileDisconnected(onResync))
    unmount()
    act(() => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS * 3) })
    expect(onResync).not.toHaveBeenCalled()
  })
})
