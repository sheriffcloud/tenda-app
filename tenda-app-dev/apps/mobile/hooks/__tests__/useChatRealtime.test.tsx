/**
 * Thread realtime orchestration: channel subscription per conversation,
 * debounced read-sync for THEIR messages only, one catch-up fetch on
 * reconnect, and the DoD assertion — the fallback poll runs ONLY while the
 * socket is down.
 *
 * The register half is #56: the hook tells the `user:<id>` inbox mirror which
 * thread is on screen, and takes it back on unmount. Mirrors web's
 * hooks/chat/__tests__/useChatRealtime.test.tsx case for case.
 */
import { renderHook, act } from '@testing-library/react-native'
import type { Message } from '@tenda/shared'

const mockChannel = {
  id: null as string | null,
  listener: null as ((message: Message) => void) | null,
  unsubscribed: 0,
}
const mockPolledWith: Array<string | null> = []
/** Every value the hook registers, in order — so a test can assert it was
 *  CLEARED on unmount, not merely set at some point. */
const mockOpenConversation: Array<string> = []

jest.mock('@/stores/realtime.store', () => {
  const { create } = require('zustand')
  return {
    useRealtimeStore: create(() => ({ connected: false })),
    subscribeChatChannel: (id: string, onMessage?: (message: Message) => void) => {
      mockChannel.id = id
      mockChannel.listener = onMessage ?? null
      return () => {
        mockChannel.unsubscribed += 1
        mockChannel.listener = null
      }
    },
    setOpenConversation: (id: string) => {
      mockOpenConversation.push(id)
    },
    // Recorded as `clear:<id>` so a test can see WHICH thread was released,
    // not merely that something was.
    clearOpenConversation: (id: string) => {
      mockOpenConversation.push(`clear:${id}`)
    },
  }
})
jest.mock('@/hooks/useMessagePolling', () => ({
  useMessagePolling: (id: string | null) => {
    mockPolledWith.push(id)
  },
}))
jest.mock('@/api/client', () => ({
  api: { conversations: { messages: jest.fn(), list: jest.fn() } },
}))

import { useChatRealtime } from '@/hooks/useChatRealtime'
import { useRealtimeStore } from '@/stores/realtime.store'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'

const fetchMessages = jest.fn<Promise<Message[]>, [string, string?]>()

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
    created_at: '2026-08-19T09:00:00.000Z',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
  }
}

beforeEach(() => {
  jest.useFakeTimers()
  fetchMessages.mockReset().mockResolvedValue([])
  mockChannel.id = null
  mockChannel.listener = null
  mockChannel.unsubscribed = 0
  mockPolledWith.length = 0
  mockOpenConversation.length = 0
  useRealtimeStore.setState({ connected: false })
  useChatStore.setState({ fetchMessages })
  useAuthStore.setState({ user: { id: 'me' } as never })
})
afterEach(() => {
  jest.useRealTimers()
})

test('subscribes to the conversation channel and unsubscribes on unmount', () => {
  const { unmount } = renderHook(() => useChatRealtime('c1'))
  expect(mockChannel.id).toBe('c1')
  unmount()
  expect(mockChannel.unsubscribed).toBe(1)
})

test('a THEIR frame schedules ONE debounced read-sync fetch; my own echo schedules none', async () => {
  renderHook(() => useChatRealtime('c1'))

  act(() => mockChannel.listener?.({ ...themMessage('m1'), sender_id: 'me' }))
  await act(async () => { jest.advanceTimersByTime(2_000) })
  expect(fetchMessages).not.toHaveBeenCalled()

  act(() => {
    mockChannel.listener?.(themMessage('m2'))
    mockChannel.listener?.(themMessage('m3')) // debounce collapses the pair
  })
  await act(async () => { jest.advanceTimersByTime(1_000) })
  expect(fetchMessages).toHaveBeenCalledTimes(1)
})

test('poll runs ONLY while the socket is down: null id is passed while connected', () => {
  useRealtimeStore.setState({ connected: true })
  const { rerender } = renderHook(() => useChatRealtime('c1'))
  expect(mockPolledWith.at(-1)).toBeNull()

  act(() => useRealtimeStore.setState({ connected: false }))
  rerender({})
  expect(mockPolledWith.at(-1)).toBe('c1')
})

test('a disconnected→connected transition fires exactly one catch-up fetch', () => {
  renderHook(() => useChatRealtime('c1'))
  expect(fetchMessages).not.toHaveBeenCalled()
  act(() => useRealtimeStore.setState({ connected: true }))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
  act(() => useRealtimeStore.setState({ connected: true }))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
})

test('a failing read-sync is contained — the message is already on screen', async () => {
  // The negative half of the debounce case. Read-sync rides GET /messages and
  // is best-effort by design: the message the reader can already see must not
  // be taken away, and a rejected fetch must not surface as an unhandled
  // rejection in the RN runtime.
  fetchMessages.mockRejectedValue(new Error('read-sync down'))
  renderHook(() => useChatRealtime('c1'))

  act(() => mockChannel.listener?.(themMessage('m1')))
  await act(async () => { jest.advanceTimersByTime(1_000) })

  expect(fetchMessages).toHaveBeenCalledTimes(1)
})

test('registers the open thread with the inbox mirror, and CLEARS it on unmount', () => {
  // The register is what lets subscribeUserChannel skip its refetch for the
  // thread on screen (#56). Clearing matters as much as setting: leave it set
  // and the inbox goes permanently stale for the last thread visited.
  const { unmount } = renderHook(() => useChatRealtime('c1'))
  expect(mockOpenConversation).toEqual(['c1'])

  unmount()
  expect(mockOpenConversation).toEqual(['c1', 'clear:c1'])
})

test('switching threads hands the mirror the new conversation, never a stale one', () => {
  const { rerender, unmount } = renderHook(({ id }: { id: string }) => useChatRealtime(id), {
    initialProps: { id: 'c1' },
  })
  rerender({ id: 'c2' })
  // React cleans up the old effect before running the new one, so the register
  // ends on 'c2' — the order is the assertion, not just the last value.
  expect(mockOpenConversation).toEqual(['c1', 'clear:c1', 'c2'])

  unmount()
  expect(mockOpenConversation).toEqual(['c1', 'clear:c1', 'c2', 'clear:c2'])
})

test('a null conversation registers nothing', () => {
  renderHook(() => useChatRealtime(null))
  expect(mockOpenConversation).toEqual([])
})
