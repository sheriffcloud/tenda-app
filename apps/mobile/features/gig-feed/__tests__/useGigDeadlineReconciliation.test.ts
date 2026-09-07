import { act, renderHook } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'
import { gigDetail } from '@/components/gig/__fixtures__/gig-detail'
import { GIG_FEED_DEADLINE_RETRY_INTERVAL_MS } from '../gig-feed.configuration'
import { useGigDeadlineReconciliation } from '../useGigDeadlineReconciliation'

let appStateListener: ((state: AppStateStatus) => void) | undefined

beforeEach(() => {
  jest.useFakeTimers()
  appStateListener = undefined
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, listener) => {
    appStateListener = listener
    return { remove: jest.fn() }
  }) as typeof AppState.addEventListener)
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

test('reconciles at the nearest deadline without directly removing the gig', () => {
  const refresh = jest.fn(async () => true)
  const deadline = new Date(Date.now() + 1_000).toISOString()
  renderHook(() => useGigDeadlineReconciliation([gigDetail({ accept_deadline: deadline })], refresh))
  act(() => jest.advanceTimersByTime(999))
  expect(refresh).not.toHaveBeenCalled()
  act(() => jest.advanceTimersByTime(1))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('foregrounding reconciles changes missed while the device slept', () => {
  const refresh = jest.fn(async () => true)
  renderHook(() => useGigDeadlineReconciliation([], refresh))
  act(() => appStateListener?.('background'))
  expect(refresh).not.toHaveBeenCalled()
  act(() => appStateListener?.('active'))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('an ahead device clock does not create a zero-delay refresh loop', async () => {
  const refresh = jest.fn(async () => true)
  const gig = gigDetail({ accept_deadline: new Date(Date.now() - 1_000).toISOString() })
  let items = [gig]
  const { rerender } = renderHook(() => useGigDeadlineReconciliation(items, refresh))
  await act(async () => jest.runOnlyPendingTimersAsync())
  expect(refresh).toHaveBeenCalledTimes(1)

  items = [{ ...gig }]
  rerender({})
  act(() => jest.runOnlyPendingTimers())
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('a deadline beyond the maximum timer delay re-arms until it is reached', () => {
  const refresh = jest.fn(async () => true)
  const maximumTimerDelayMs = 2_147_483_647
  const remainingAfterFirstWakeMs = 10_000
  const deadline = new Date(
    Date.now() + maximumTimerDelayMs + remainingAfterFirstWakeMs,
  ).toISOString()
  renderHook(() => useGigDeadlineReconciliation(
    [gigDetail({ accept_deadline: deadline })],
    refresh,
  ))

  act(() => jest.advanceTimersByTime(maximumTimerDelayMs))
  expect(refresh).not.toHaveBeenCalled()
  act(() => jest.advanceTimersByTime(remainingAfterFirstWakeMs - 1))
  expect(refresh).not.toHaveBeenCalled()
  act(() => jest.advanceTimersByTime(1))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('an unsuccessful deadline reconciliation retries instead of marking it complete', async () => {
  const refresh = jest.fn()
    .mockResolvedValueOnce(false)
    .mockResolvedValue(true)
  const deadline = new Date(Date.now() + 1_000).toISOString()
  renderHook(() => useGigDeadlineReconciliation(
    [gigDetail({ accept_deadline: deadline })],
    refresh,
  ))

  await act(async () => jest.advanceTimersByTimeAsync(1_000))
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(async () => jest.advanceTimersByTimeAsync(GIG_FEED_DEADLINE_RETRY_INTERVAL_MS - 1))
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(async () => jest.advanceTimersByTimeAsync(1))
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('ignores missing and malformed deadlines and chooses the nearest valid one', async () => {
  const refresh = jest.fn(async () => true)
  const later = gigDetail({
    escrow_id: 'later',
    accept_deadline: new Date(Date.now() + 2_000).toISOString(),
  })
  const sooner = gigDetail({
    escrow_id: 'sooner',
    accept_deadline: new Date(Date.now() + 1_000).toISOString(),
  })
  renderHook(() => useGigDeadlineReconciliation([
    gigDetail({ escrow_id: 'none', accept_deadline: null }),
    gigDetail({ escrow_id: 'invalid', accept_deadline: 'invalid' }),
    later,
    sooner,
  ], refresh))

  await act(async () => jest.advanceTimersByTimeAsync(999))
  expect(refresh).not.toHaveBeenCalled()
  await act(async () => jest.advanceTimersByTimeAsync(1))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('unmount cancels a scheduled deadline and a pending retry', async () => {
  const refresh = jest.fn().mockResolvedValue(false)
  const deadline = new Date(Date.now() + 1_000).toISOString()
  const { unmount } = renderHook(() => useGigDeadlineReconciliation(
    [gigDetail({ accept_deadline: deadline })],
    refresh,
  ))

  await act(async () => jest.advanceTimersByTimeAsync(1_000))
  expect(refresh).toHaveBeenCalledTimes(1)
  unmount()
  await act(async () => jest.advanceTimersByTimeAsync(GIG_FEED_DEADLINE_RETRY_INTERVAL_MS))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('a failed foreground refresh is handled without scheduling a deadline retry', async () => {
  const refresh = jest.fn().mockRejectedValue(new Error('offline'))
  renderHook(() => useGigDeadlineReconciliation([], refresh))
  await act(async () => {
    appStateListener?.('active')
    await Promise.resolve()
  })
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(async () => jest.advanceTimersByTimeAsync(GIG_FEED_DEADLINE_RETRY_INTERVAL_MS))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('removing a reconciled deadline clears its attempt marker if the gig returns', async () => {
  const refresh = jest.fn(async () => true)
  const gig = gigDetail({ accept_deadline: new Date(Date.now() - 1_000).toISOString() })
  let items = [gig]
  const { rerender } = renderHook(() => useGigDeadlineReconciliation(items, refresh))
  await act(async () => jest.runOnlyPendingTimersAsync())
  expect(refresh).toHaveBeenCalledTimes(1)

  items = []
  rerender({})
  items = [gig]
  rerender({})
  await act(async () => jest.runOnlyPendingTimersAsync())
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('settling an in-flight deadline refresh after unmount schedules no further work', async () => {
  let rejectRefresh: ((error: Error) => void) | undefined
  const refresh = jest.fn(() => new Promise<boolean>((_resolve, reject) => {
    rejectRefresh = reject
  }))
  const deadline = new Date(Date.now() + 1_000).toISOString()
  const { unmount } = renderHook(() => useGigDeadlineReconciliation(
    [gigDetail({ accept_deadline: deadline })],
    refresh,
  ))

  act(() => jest.advanceTimersByTime(1_000))
  unmount()
  await act(async () => {
    rejectRefresh?.(new Error('offline'))
    await Promise.resolve()
  })
  await act(async () => jest.advanceTimersByTimeAsync(GIG_FEED_DEADLINE_RETRY_INTERVAL_MS))
  expect(refresh).toHaveBeenCalledTimes(1)
})
