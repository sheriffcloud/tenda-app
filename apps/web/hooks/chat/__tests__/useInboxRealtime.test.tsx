/**
 * Inbox realtime orchestration: `user:<id>` subscription tied to the
 * session, one initial badge load, one refetch per reconnect, and the
 * fallback list-poll enabled ONLY while the socket is down.
 */
import { renderHook, act } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

const { userChannel, pollEnabled } = vi.hoisted(() => ({
  userChannel: { id: null as string | null, unsubscribed: 0 },
  pollEnabled: { current: [] as boolean[] },
}))

vi.mock('@/stores/realtime.store', async () => {
  const { create } = await import('zustand')
  return {
    useRealtimeStore: create<{ connected: boolean }>(() => ({ connected: false })),
    subscribeUserChannel: (id: string) => {
      userChannel.id = id
      return () => {
        userChannel.unsubscribed += 1
      }
    },
  }
})

vi.mock('@/hooks/chat/useConversationPolling', () => ({
  useConversationPolling: (enabled: boolean) => {
    pollEnabled.current.push(enabled)
  },
}))

import { useInboxRealtime } from '@/hooks/chat/useInboxRealtime'
import { useRealtimeStore } from '@/stores/realtime.store'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { makeUser } from '../../../test/factories/user'

const fetchConversations = vi.fn<() => Promise<void>>()

beforeEach(() => {
  fetchConversations.mockReset().mockResolvedValue()
  userChannel.id = null
  userChannel.unsubscribed = 0
  pollEnabled.current = []
  useRealtimeStore.setState({ connected: false })
  useChatStore.setState({ fetchConversations })
  useAuthStore.setState({ user: makeUser({ id: 'me' }) })
})

test('subscribes user:<my id>, loads the badge once, and unsubscribes on unmount', () => {
  const { unmount } = renderHook(() => useInboxRealtime())
  expect(userChannel.id).toBe('me')
  expect(fetchConversations).toHaveBeenCalledTimes(1)
  unmount()
  expect(userChannel.unsubscribed).toBe(1)
})

test('no session → no channel subscription', () => {
  useAuthStore.setState({ user: null })
  renderHook(() => useInboxRealtime())
  expect(userChannel.id).toBeNull()
})

test('the fallback poll is enabled only while the socket is down', () => {
  useRealtimeStore.setState({ connected: true })
  const { rerender } = renderHook(() => useInboxRealtime())
  expect(pollEnabled.current.at(-1)).toBe(false)

  act(() => useRealtimeStore.setState({ connected: false }))
  rerender()
  expect(pollEnabled.current.at(-1)).toBe(true)
})

test('a reconnect refreshes the badge exactly once per transition', () => {
  renderHook(() => useInboxRealtime())
  expect(fetchConversations).toHaveBeenCalledTimes(1) // mount load
  act(() => useRealtimeStore.setState({ connected: true }))
  expect(fetchConversations).toHaveBeenCalledTimes(2)
  act(() => useRealtimeStore.setState({ connected: true }))
  expect(fetchConversations).toHaveBeenCalledTimes(2)
})
