/**
 * useEscrowLiveRefresh — the #4 fix. Detail screens previously refreshed only
 * on focus, so a counterparty's action never showed live. This hook subscribes
 * to the escrow WS channel and refetches (debounced) on any frame, and cleanly
 * unsubscribes on unmount.
 */
import { renderHook, act } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'
import { ESCROW_EVENT_DEBOUNCE_MS, ESCROW_FOCUSED_POLL_MS } from '@/hooks/escrow-live/constants'
import { useEscrowLiveRefresh } from '@/hooks/useEscrowLiveRefresh'
import { isAppStateActive } from '@/hooks/escrow-live/useEscrowLiveRefresh'

type FrameCb = () => void
type ConnectionState = { connected: boolean }
type NetworkState = { isConnected: boolean; isInternetReachable: boolean }
const mockUnsub = jest.fn()
const mockSubscribe = jest.fn<() => void, [string, FrameCb]>()
const mockConnectionUnsub = jest.fn()
const mockNetworkUnsub = jest.fn()
let connectionListener: ((next: ConnectionState, previous: ConnectionState) => void) | null
let networkListener: ((state: NetworkState) => void) | null
let appStateListener: ((state: AppStateStatus) => void) | null
let mockFocused = true
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}))
jest.mock('@/stores/realtime.store', () => ({
  subscribeEscrowChannel: (id: string, cb: FrameCb) => mockSubscribe(id, cb),
  useRealtimeStore: {
    subscribe: (listener: (next: ConnectionState, previous: ConnectionState) => void) => {
      connectionListener = listener
      return mockConnectionUnsub
    },
  },
}))
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (listener: (state: NetworkState) => void) => {
      networkListener = listener
      return mockNetworkUnsub
    },
  },
}))

/** Invoke the frame callback the hook registered (simulate an inbound frame). */
function fireFrame(): void {
  mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1][1]()
}

beforeEach(() => {
  jest.useFakeTimers()
  mockSubscribe.mockReset()
  mockUnsub.mockReset()
  mockConnectionUnsub.mockReset()
  mockNetworkUnsub.mockReset()
  connectionListener = null
  networkListener = null
  appStateListener = null
  mockFocused = true
  mockSubscribe.mockReturnValue(mockUnsub)
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, listener) => {
    appStateListener = listener
    return { remove: jest.fn() }
  }) as typeof AppState.addEventListener)
})
afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

test('subscribes to the escrow channel by id', () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  expect(mockSubscribe).toHaveBeenCalledWith('e1', expect.any(Function))
})

test('a frame triggers exactly one debounced refresh', () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => { fireFrame() })
  expect(refresh).not.toHaveBeenCalled() // debounced, not immediate
  act(() => { jest.advanceTimersByTime(400) })
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('a burst of frames coalesces into a single refresh', () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => { fireFrame(); fireFrame(); fireFrame() })
  act(() => { jest.advanceTimersByTime(400) })
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('always calls the LATEST refresh, without resubscribing', () => {
  const first = jest.fn()
  const second = jest.fn()
  const { rerender } = renderHook<void, { r: () => void }>(
    ({ r }) => useEscrowLiveRefresh('e1', r, 'accepted'),
    { initialProps: { r: first } },
  )
  rerender({ r: second })
  expect(mockSubscribe).toHaveBeenCalledTimes(1) // stable subscription
  act(() => { fireFrame() })
  act(() => { jest.advanceTimersByTime(400) })
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledTimes(1)
})

test('unmount unsubscribes and cancels a pending refresh', () => {
  const refresh = jest.fn()
  const { unmount } = renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => { fireFrame() })
  unmount()
  expect(mockUnsub).toHaveBeenCalledTimes(1)
  act(() => { jest.advanceTimersByTime(400) })
  expect(refresh).not.toHaveBeenCalled() // pending timer cleared on unmount
})

test('no escrow id → no subscription', () => {
  renderHook(() => useEscrowLiveRefresh(undefined, jest.fn(), 'accepted'))
  expect(mockSubscribe).not.toHaveBeenCalled()
})

test('refreshes immediately when the realtime connection recovers', () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => connectionListener?.({ connected: true }, { connected: false }))
  expect(refresh).toHaveBeenCalledTimes(1)
  act(() => connectionListener?.({ connected: false }, { connected: true }))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('a socket reconnect does not issue reads while backgrounded or offline', () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))

  act(() => appStateListener?.('background'))
  act(() => connectionListener?.({ connected: true }, { connected: false }))
  expect(refresh).not.toHaveBeenCalled()

  act(() => appStateListener?.('active'))
  expect(refresh).toHaveBeenCalledTimes(1)
  act(() => networkListener?.({ isConnected: false, isInternetReachable: false }))
  act(() => connectionListener?.({ connected: true }, { connected: false }))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('refreshes on foreground and restarts focused polling', async () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => appStateListener?.('background'))
  act(() => jest.advanceTimersByTime(ESCROW_FOCUSED_POLL_MS))
  expect(refresh).not.toHaveBeenCalled()
  await act(async () => { appStateListener?.('active'); await Promise.resolve() })
  expect(refresh).toHaveBeenCalledTimes(1)
  act(() => jest.advanceTimersByTime(ESCROW_FOCUSED_POLL_MS))
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('only explicit background states park startup convergence', () => {
  expect(isAppStateActive('background')).toBe(false)
  expect(isAppStateActive('inactive')).toBe(false)
  expect(isAppStateActive('active')).toBe(true)
  expect(isAppStateActive(null)).toBe(true)
})

test('a queued WS refresh is cancelled in background and recovered on foreground', async () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => { fireFrame(); appStateListener?.('background') })
  act(() => { fireFrame() })
  act(() => jest.advanceTimersByTime(ESCROW_EVENT_DEBOUNCE_MS))
  expect(refresh).not.toHaveBeenCalled()

  await act(async () => { appStateListener?.('active'); await Promise.resolve() })
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('pauses offline and converges immediately after network recovery', () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => networkListener?.({ isConnected: false, isInternetReachable: false }))
  act(() => jest.advanceTimersByTime(ESCROW_FOCUSED_POLL_MS))
  expect(refresh).not.toHaveBeenCalled()
  act(() => networkListener?.({ isConnected: true, isInternetReachable: true }))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('a queued WS refresh is cancelled offline and recovered when online', async () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  act(() => {
    fireFrame()
    networkListener?.({ isConnected: false, isInternetReachable: false })
  })
  act(() => { fireFrame() })
  act(() => jest.advanceTimersByTime(ESCROW_EVENT_DEBOUNCE_MS))
  expect(refresh).not.toHaveBeenCalled()

  await act(async () => {
    networkListener?.({ isConnected: true, isInternetReachable: true })
    await Promise.resolve()
  })
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('does not poll a settled escrow', () => {
  const refresh = jest.fn()
  renderHook(() => useEscrowLiveRefresh('e1', refresh, 'completed'))
  act(() => jest.advanceTimersByTime(ESCROW_FOCUSED_POLL_MS * 2))
  expect(refresh).not.toHaveBeenCalled()
})

test('blur tears down refresh sources and focus subscribes again', () => {
  const refresh = jest.fn()
  const { rerender } = renderHook(() => useEscrowLiveRefresh('e1', refresh, 'accepted'))
  expect(mockSubscribe).toHaveBeenCalledTimes(1)

  mockFocused = false
  rerender(undefined)
  expect(mockUnsub).toHaveBeenCalledTimes(1)
  act(() => jest.advanceTimersByTime(ESCROW_FOCUSED_POLL_MS))
  expect(refresh).not.toHaveBeenCalled()

  mockFocused = true
  rerender(undefined)
  expect(mockSubscribe).toHaveBeenCalledTimes(2)
})
