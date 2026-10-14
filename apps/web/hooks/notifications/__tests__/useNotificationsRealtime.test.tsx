/**
 * Bell-badge lifecycle: one count refresh on mount, one per reconnect
 * transition — the live increments themselves ride the user-channel
 * subscription (realtime.store), not this hook.
 */
import { renderHook, act } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('@/stores/realtime.store', async () => {
  const { create } = await import('zustand')
  return { useRealtimeStore: create<{ connected: boolean }>(() => ({ connected: false })) }
})

import { useNotificationsRealtime } from '@/hooks/notifications/useNotificationsRealtime'
import { useRealtimeStore } from '@/stores/realtime.store'
import { useNotificationsStore } from '@/stores/notifications.store'

const refreshUnread = vi.fn<() => Promise<void>>()

beforeEach(() => {
  vi.clearAllMocks()
  refreshUnread.mockResolvedValue()
  useRealtimeStore.setState({ connected: false })
  useNotificationsStore.setState({ refreshUnread })
})

test('refreshes the count on mount', () => {
  renderHook(() => useNotificationsRealtime())
  expect(refreshUnread).toHaveBeenCalledTimes(1)
})

test('a reconnect refreshes exactly once per transition', () => {
  renderHook(() => useNotificationsRealtime())
  act(() => useRealtimeStore.setState({ connected: true }))
  expect(refreshUnread).toHaveBeenCalledTimes(2)
  act(() => useRealtimeStore.setState({ connected: true }))
  expect(refreshUnread).toHaveBeenCalledTimes(2)
  act(() => useRealtimeStore.setState({ connected: false }))
  act(() => useRealtimeStore.setState({ connected: true }))
  expect(refreshUnread).toHaveBeenCalledTimes(3)
})
