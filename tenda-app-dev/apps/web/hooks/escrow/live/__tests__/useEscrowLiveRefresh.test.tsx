/**
 * Web port of mobile's useEscrowLiveRefresh suite: WS-frame debounce and
 * coalescing, reconnect/foreground/online recovery gated on tab
 * visibility + connectivity, focused polling that skips settled escrows,
 * and full teardown on unmount.
 */
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

type FrameCb = () => void
type ConnectionState = { connected: boolean }

const { channel, connection } = vi.hoisted(() => ({
  channel: { id: null as string | null, cb: null as FrameCb | null, unsub: 0 },
  connection: {
    listener: null as ((next: ConnectionState, previous: ConnectionState) => void) | null,
    unsub: 0,
  },
}))

vi.mock('@/stores/realtime.store', () => ({
  subscribeEscrowChannel: (id: string, cb: FrameCb) => {
    channel.id = id
    channel.cb = cb
    return () => {
      channel.unsub += 1
      channel.cb = null
    }
  },
  useRealtimeStore: {
    subscribe: (listener: (next: ConnectionState, previous: ConnectionState) => void) => {
      connection.listener = listener
      return () => {
        connection.unsub += 1
        connection.listener = null
      }
    },
  },
}))

import { useEscrowLiveRefresh } from '@/hooks/escrow/live'
import { ESCROW_EVENT_DEBOUNCE_MS, ESCROW_FOCUSED_POLL_MS } from '@tenda/shared'

let visibilityState: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibilityState,
})
let onLine = true
Object.defineProperty(window.navigator, 'onLine', {
  configurable: true,
  get: () => onLine,
})

function setVisibility(next: DocumentVisibilityState) {
  visibilityState = next
  document.dispatchEvent(new Event('visibilitychange'))
}
function setOnline(next: boolean) {
  onLine = next
  window.dispatchEvent(new Event(next ? 'online' : 'offline'))
}

const fireFrame = () => channel.cb?.()

beforeEach(() => {
  vi.useFakeTimers()
  visibilityState = 'visible'
  onLine = true
  channel.id = null
  channel.cb = null
  channel.unsub = 0
  connection.listener = null
  connection.unsub = 0
})

afterEach(() => {
  vi.useRealTimers()
})

test('subscribes by id; no id → no subscription', () => {
  renderHook(() => useEscrowLiveRefresh('e1', vi.fn(), 'accepted'))
  expect(channel.id).toBe('e1')

  channel.id = null
  renderHook(() => useEscrowLiveRefresh(undefined, vi.fn(), 'accepted'))
  expect(channel.id).toBeNull()
})

test('a burst of frames coalesces into one debounced refresh', () => {
  const refresh = vi.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => {
    fireFrame()
    fireFrame()
    fireFrame()
  })
  expect(refresh).not.toHaveBeenCalled() // debounced, not immediate
  act(() => vi.advanceTimersByTime(ESCROW_EVENT_DEBOUNCE_MS))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('always calls the LATEST refresh, without resubscribing', () => {
  const first = vi.fn()
  const second = vi.fn()
  const { rerender } = renderHook(({ r }: { r: () => void }) => useEscrowLiveRefresh('e1', r, 'accepted'), {
    initialProps: { r: first },
  })
  rerender({ r: second })
  expect(channel.unsub).toBe(0) // stable subscription
  act(() => fireFrame())
  act(() => vi.advanceTimersByTime(ESCROW_EVENT_DEBOUNCE_MS))
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledTimes(1)
})

test('unmount unsubscribes everything and cancels a pending refresh', () => {
  const refresh = vi.fn()
  const { unmount } = renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => fireFrame())
  unmount()
  expect(channel.unsub).toBe(1)
  expect(connection.unsub).toBe(1)
  act(() => vi.advanceTimersByTime(ESCROW_EVENT_DEBOUNCE_MS))
  expect(refresh).not.toHaveBeenCalled()
})

test('refreshes immediately on reconnect — but not while hidden or offline', async () => {
  const refresh = vi.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  // await between triggers: the coordinator's `await refresh()` continuation
  // is a microtask — a fully sync test would leave it `running` forever and
  // later requests would only queue a trailing run (mobile's suite awaits
  // at the same points for the same reason).
  await act(async () => connection.listener?.({ connected: true }, { connected: false }))
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(async () => connection.listener?.({ connected: false }, { connected: true }))
  expect(refresh).toHaveBeenCalledTimes(1) // disconnect is not a trigger

  act(() => setVisibility('hidden'))
  await act(async () => connection.listener?.({ connected: true }, { connected: false }))
  expect(refresh).toHaveBeenCalledTimes(1) // hidden parks reads
  await act(async () => setVisibility('visible'))
  expect(refresh).toHaveBeenCalledTimes(2) // tab return converges

  act(() => setOnline(false))
  await act(async () => connection.listener?.({ connected: true }, { connected: false }))
  expect(refresh).toHaveBeenCalledTimes(2) // offline parks reads
})

test('focused polling ticks while visible+online and restarts on tab return', async () => {
  const refresh = vi.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  await act(() => vi.advanceTimersByTimeAsync(ESCROW_FOCUSED_POLL_MS))
  expect(refresh).toHaveBeenCalledTimes(1)

  act(() => setVisibility('hidden'))
  await act(() => vi.advanceTimersByTimeAsync(ESCROW_FOCUSED_POLL_MS * 2))
  expect(refresh).toHaveBeenCalledTimes(1) // parked

  await act(async () => setVisibility('visible'))
  expect(refresh).toHaveBeenCalledTimes(2) // immediate convergence
  await act(() => vi.advanceTimersByTimeAsync(ESCROW_FOCUSED_POLL_MS))
  expect(refresh).toHaveBeenCalledTimes(3) // cadence resumed
})

test('a queued WS refresh dies with the hidden tab and recovers on return', () => {
  const refresh = vi.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => {
    fireFrame()
    setVisibility('hidden')
  })
  act(() => fireFrame()) // frames while hidden schedule nothing
  act(() => vi.advanceTimersByTime(ESCROW_EVENT_DEBOUNCE_MS))
  expect(refresh).not.toHaveBeenCalled()

  act(() => setVisibility('visible'))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('pauses offline and converges immediately after network recovery', () => {
  const refresh = vi.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => setOnline(false))
  act(() => vi.advanceTimersByTime(ESCROW_FOCUSED_POLL_MS))
  expect(refresh).not.toHaveBeenCalled()
  act(() => setOnline(true))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('never polls a settled escrow, but frames still refresh it', () => {
  const refresh = vi.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'completed'))
  act(() => vi.advanceTimersByTime(ESCROW_FOCUSED_POLL_MS * 2))
  expect(refresh).not.toHaveBeenCalled()

  act(() => fireFrame())
  act(() => vi.advanceTimersByTime(ESCROW_EVENT_DEBOUNCE_MS))
  expect(refresh).toHaveBeenCalledTimes(1) // a late frame still converges
})
