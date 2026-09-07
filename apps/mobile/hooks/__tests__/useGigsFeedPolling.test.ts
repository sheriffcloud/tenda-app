/**
 * useGigsFeedPolling — the feed poller, post-pagination. The two behaviours
 * that changed and must not regress:
 *   - it polls via `reload` (preserves loaded pages), never a page-0 replace;
 *   - back-off is driven by the server `total`, not the loaded row count,
 *     which changes every time the user pages and would pin the poll at its
 *     fast interval forever.
 */
import { renderHook, act } from '@testing-library/react-native'
import { AppState } from 'react-native'

// useFocusEffect ≡ useEffect for a mounted screen: run on mount, clean up on
// unmount. That is exactly the focus/blur pair the poller relies on.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => (() => void) | undefined) => {
    const { useEffect } = require('react')
    useEffect(cb, [cb])
  },
}))

import { useGigsFeedPolling } from '@/hooks/useGigsFeedPolling'
import {
  GIG_FEED_ACTIVE_RECOVERY_INTERVAL_MS,
  GIG_FEED_IDLE_RECOVERY_INTERVAL_MS,
} from '@/features/gig-feed/gig-feed.configuration'

const ACTIVE_MS = GIG_FEED_ACTIVE_RECOVERY_INTERVAL_MS
const IDLE_MS = GIG_FEED_IDLE_RECOVERY_INTERVAL_MS

let appStateListener: ((s: string) => void) | undefined

beforeEach(() => {
  jest.useFakeTimers()
  appStateListener = undefined
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    cb: (s: string) => void,
  ) => {
    appStateListener = cb
    return { remove: () => {} }
    // The RN overload set is wider than the one call we make here.
  }) as unknown as typeof AppState.addEventListener)
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

test('does not fetch on focus — the list controller owns the first page', () => {
  const reload = jest.fn(async () => 0)
  renderHook(() => useGigsFeedPolling({ reload }))
  // Fetching here as well would double every tab entry.
  expect(reload).not.toHaveBeenCalled()
})

test('polls via reload on the active interval', async () => {
  const reload = jest.fn(async () => 0)
  renderHook(() => useGigsFeedPolling({ reload }))

  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(1)
})

test('backs off to the idle interval after 3 polls with an unchanged total', async () => {
  const reload = jest.fn(async () => 7)
  renderHook(() => useGigsFeedPolling({ reload }))

  for (let i = 0; i < 3; i++) {
    await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  }
  expect(reload).toHaveBeenCalledTimes(3)

  // A 4th active-interval tick must NOT fire — the poller is now idle-paced.
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(3)

  await act(async () => { jest.advanceTimersByTime(IDLE_MS - ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(4)
})

test('a changing total keeps the poller on the fast interval', async () => {
  // Each poll reports a bigger total — new gigs keep arriving.
  let total = 7
  const reload = jest.fn(async () => ++total)
  renderHook(() => useGigsFeedPolling({ reload }))

  for (let i = 0; i < 5; i++) {
    await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  }
  // Still on the fast interval well past the 3-poll back-off threshold.
  expect(reload).toHaveBeenCalledTimes(5)
})

test('the total must arrive through the promise, not a prop read a render late', async () => {
  // The regression this guards: reading the total from a ref/prop right after
  // `await reload()` sees the PRE-poll value (refs update on the next render),
  // so every poll looks unchanged and the feed backs off even while busy.
  const totals = [10, 20, 30, 40]
  const reload = jest.fn(async () => totals.shift() ?? 99)
  renderHook(() => useGigsFeedPolling({ reload }))

  for (let i = 0; i < 4; i++) {
    await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  }
  expect(reload).toHaveBeenCalledTimes(4)
})

test('resets its back-off baseline when the app returns to the foreground', async () => {
  const reload = jest.fn(async () => 7)
  renderHook(() => useGigsFeedPolling({ reload }))

  // Back off first.
  for (let i = 0; i < 3; i++) {
    await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  }
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(3) // idle-paced

  act(() => appStateListener?.('active'))
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(4) // fast again after foregrounding
})

test('pauses on background and resumes on foreground', async () => {
  const reload = jest.fn(async () => 0)
  renderHook(() => useGigsFeedPolling({ reload }))

  act(() => appStateListener?.('background'))
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS * 3) })
  expect(reload).not.toHaveBeenCalled()

  act(() => appStateListener?.('active'))
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(1)
})

test('stops polling once the screen loses focus', async () => {
  const reload = jest.fn(async () => 0)
  const { unmount } = renderHook(() => useGigsFeedPolling({ reload }))
  unmount()
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS * 3) })
  expect(reload).not.toHaveBeenCalled()
})

test('skips a tick while the previous reload is still in flight', async () => {
  // Slow feed: a tick landing on top of an unfinished poll must re-arm the
  // timer rather than stack a second concurrent request.
  let release: (() => void) | undefined
  const reload = jest.fn(
    () => new Promise<number>((resolve) => { release = () => resolve(1) }),
  )
  renderHook(() => useGigsFeedPolling({ reload }))

  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(1)

  // Second tick while the first is unresolved — no new call.
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(1)

  await act(async () => { release?.() })
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(2)
})

test('a foreground resume during an in-flight poll re-arms instead of stacking', async () => {
  // Foregrounding schedules a tick unconditionally, so it CAN land on top of
  // a still-running poll. That tick must re-arm the timer, not fire a second
  // concurrent reload.
  let release: (() => void) | undefined
  const reload = jest.fn(
    () => new Promise<number>((resolve) => { release = () => resolve(1) }),
  )
  renderHook(() => useGigsFeedPolling({ reload }))

  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(1) // in flight, unresolved

  act(() => appStateListener?.('active')) // arms a fresh timer mid-flight
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(1) // skipped, not stacked

  await act(async () => { release?.() })
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(2)
})

test('an in-flight poll settling in the background does not re-arm', async () => {
  let release: (() => void) | undefined
  const reload = jest.fn(() => new Promise<number>((resolve) => { release = () => resolve(1) }))
  renderHook(() => useGigsFeedPolling({ reload }))

  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(1)
  act(() => appStateListener?.('background'))
  await act(async () => { release?.() })
  await act(async () => { jest.advanceTimersByTime(IDLE_MS * 2) })

  expect(reload).toHaveBeenCalledTimes(1)
})

test('a rejected poll is retried on the next interval', async () => {
  const reload = jest.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(1)
  renderHook(() => useGigsFeedPolling({ reload }))

  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  await act(async () => { jest.advanceTimersByTime(ACTIVE_MS) })
  expect(reload).toHaveBeenCalledTimes(2)
})
