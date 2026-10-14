/**
 * Thread realtime orchestration: channel subscription per conversation,
 * debounced read-sync for THEIR messages only, one catch-up fetch on
 * reconnect, and the DoD assertion — the fallback poll runs ONLY while
 * the socket is down.
 */
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Message } from '@tenda/shared'

const { channel, polledWith, openConversation } = vi.hoisted(() => ({
  channel: {
    id: null as string | null,
    listener: null as ((message: Message) => void) | null,
    unsubscribed: 0,
  },
  polledWith: { current: [] as Array<string | null> },
  // Every value the hook registers, in order — so a test can assert it was
  // CLEARED on unmount, not merely set at some point.
  openConversation: { calls: [] as Array<string | null> },
}))

vi.mock('@/stores/realtime.store', async () => {
  const { create } = await import('zustand')
  return {
    useRealtimeStore: create<{ connected: boolean }>(() => ({ connected: false })),
    subscribeChatChannel: (id: string, onMessage?: (message: Message) => void) => {
      channel.id = id
      channel.listener = onMessage ?? null
      return () => {
        channel.unsubscribed += 1
        channel.listener = null
      }
    },
    setOpenConversation: (id: string | null) => {
      openConversation.calls.push(id)
    },
    // Recorded as `clear:<id>` so a test can see WHICH thread was released,
    // not merely that something was.
    clearOpenConversation: (id: string) => {
      openConversation.calls.push(`clear:${id}`)
    },
  }
})

vi.mock('@/hooks/chat/useMessagePolling', () => ({
  useMessagePolling: (id: string | null) => {
    polledWith.current.push(id)
  },
}))

import { useChatRealtime } from '@/hooks/chat/useChatRealtime'
import { useRealtimeStore } from '@/stores/realtime.store'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { makeUser } from '../../../test/factories/user'

const fetchMessages = vi.fn<(conversationId: string, beforeId?: string) => Promise<Message[]>>()

function themMessage(id: string): Message {
  return {
    id,
    conversation_id: 'c1',
    sender_id: 'them',
    escrow_id: null,
    escrow_title: null,
    escrow_kind: null,
    content: 'hi',
    read_at: null,
    created_at: '2026-08-16T09:00:00.000Z',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  fetchMessages.mockReset().mockResolvedValue([])
  channel.id = null
  channel.listener = null
  channel.unsubscribed = 0
  polledWith.current = []
  openConversation.calls = []
  useRealtimeStore.setState({ connected: false })
  useChatStore.setState({ fetchMessages })
  useAuthStore.setState({ user: makeUser({ id: 'me' }) })
})

afterEach(() => {
  vi.useRealTimers()
})

test('subscribes to the conversation channel and unsubscribes on unmount', () => {
  const { unmount } = renderHook(() => useChatRealtime('c1'))
  expect(channel.id).toBe('c1')
  unmount()
  expect(channel.unsubscribed).toBe(1)
})

test('a THEIR frame schedules ONE debounced read-sync fetch; my own echo schedules none', async () => {
  renderHook(() => useChatRealtime('c1'))

  act(() => channel.listener?.({ ...themMessage('m1'), sender_id: 'me' }))
  await act(() => vi.advanceTimersByTimeAsync(2_000))
  expect(fetchMessages).not.toHaveBeenCalled()

  act(() => {
    channel.listener?.(themMessage('m2'))
    channel.listener?.(themMessage('m3')) // debounce collapses the pair
  })
  await act(() => vi.advanceTimersByTimeAsync(1_000))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
})

test('poll runs ONLY while the socket is down: null id is passed while connected', () => {
  useRealtimeStore.setState({ connected: true })
  const { rerender } = renderHook(() => useChatRealtime('c1'))
  expect(polledWith.current.at(-1)).toBeNull()

  act(() => useRealtimeStore.setState({ connected: false }))
  rerender()
  expect(polledWith.current.at(-1)).toBe('c1')
})

test('a disconnected→connected transition fires exactly one catch-up fetch', () => {
  renderHook(() => useChatRealtime('c1'))
  expect(fetchMessages).not.toHaveBeenCalled()
  act(() => useRealtimeStore.setState({ connected: true }))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
  act(() => useRealtimeStore.setState({ connected: true }))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
})

test('registers the open thread with the inbox mirror, and CLEARS it on unmount', () => {
  // The register is what lets subscribeUserChannel skip its refetch for the
  // thread on screen (#47). Clearing it matters as much as setting it: leave it
  // set and the inbox goes permanently stale for the last thread visited.
  const { unmount } = renderHook(() => useChatRealtime('c1'))
  expect(openConversation.calls).toEqual(['c1'])

  unmount()
  expect(openConversation.calls).toEqual(['c1', 'clear:c1'])
})

test('switching threads hands the mirror the new conversation, never a stale one', () => {
  const { rerender, unmount } = renderHook(({ id }: { id: string }) => useChatRealtime(id), {
    initialProps: { id: 'c1' },
  })
  rerender({ id: 'c2' })
  // React cleans up the old effect before running the new one, so the register
  // ends on 'c2' — the order is the assertion, not just the last value.
  expect(openConversation.calls).toEqual(['c1', 'clear:c1', 'c2'])

  unmount()
  expect(openConversation.calls).toEqual(['c1', 'clear:c1', 'c2', 'clear:c2'])
})

test('a null conversation registers nothing', () => {
  renderHook(() => useChatRealtime(null))
  expect(openConversation.calls).toEqual([])
})
