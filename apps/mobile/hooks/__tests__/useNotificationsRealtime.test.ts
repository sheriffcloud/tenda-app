/**
 * useNotificationsRealtime (Stage 5/7) — keeps the bell badge current where WS
 * can't: an unread-count refresh on mount, and again after a reconnect
 * (disconnected → connected), which also catches broadcast announcements. A
 * connected → disconnected drop must NOT refresh. ws + api are mocked; the
 * stores are real so the effect wiring is exercised end to end.
 */
jest.mock('@/lib/ws', () => ({
  ws: { subscribe: jest.fn(() => () => {}), onConnectionChange: jest.fn() },
}))
jest.mock('@/api/client', () => ({
  api: {
    notifications: {
      unreadCount: jest.fn().mockResolvedValue({ count: 0 }),
      feed: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    },
    conversations: { list: jest.fn() },
  },
}))

import { renderHook, act } from '@testing-library/react-native'
import { useNotificationsRealtime } from '@/hooks/useNotificationsRealtime'
import { useRealtimeStore } from '@/stores/realtime.store'
import { api } from '@/api/client'

const unreadMock = api.notifications.unreadCount as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  useRealtimeStore.setState({ connected: false })
})

test('refreshes the unread count on mount', () => {
  renderHook(() => useNotificationsRealtime())
  expect(unreadMock).toHaveBeenCalledTimes(1)
})

test('refreshes again after a reconnect (disconnected → connected)', () => {
  renderHook(() => useNotificationsRealtime())
  unreadMock.mockClear()
  act(() => {
    useRealtimeStore.setState({ connected: true })
  })
  expect(unreadMock).toHaveBeenCalledTimes(1)
})

test('does not refresh on a connected → disconnected transition', () => {
  useRealtimeStore.setState({ connected: true })
  renderHook(() => useNotificationsRealtime())
  unreadMock.mockClear()
  act(() => {
    useRealtimeStore.setState({ connected: false })
  })
  expect(unreadMock).not.toHaveBeenCalled()
})
