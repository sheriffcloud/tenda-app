/**
 * The chat-facing channel subscriptions added in S5.2: `chat:<id>` frames
 * feed receiveMessage (non-message frames filtered), and the `user:<id>`
 * inbox mirror refetches conversations on chat frames while letting
 * notification frames fall through (S5.3's concern).
 */
import { beforeEach, expect, test, vi } from 'vitest'
import type { WsFrame } from '@/lib/ws'
import { makeMessage } from '../../test/factories/chat'

const { channelListeners } = vi.hoisted(() => ({
  channelListeners: new Map<string, (frame: unknown) => void>(),
}))

vi.mock('@/lib/ws', () => ({
  ws: {
    subscribe: vi.fn((channel: string, listener: (frame: unknown) => void) => {
      channelListeners.set(channel, listener)
      return () => channelListeners.delete(channel)
    }),
    onConnectionChange: vi.fn(() => () => {}),
  },
}))

import {
  subscribeChatChannel,
  subscribeUserChannel,
  setOpenConversation,
  clearOpenConversation,
  resetOpenConversationForTests,
} from '@/stores/realtime.store'
import { useChatStore } from '@/stores/chat.store'

const receiveMessage = vi.fn<(conversationId: string, message: ReturnType<typeof makeMessage>) => void>()
const fetchConversations = vi.fn<() => Promise<void>>()

function chatFrame(channel: string, conversation_id = 'c1'): WsFrame {
  return { channel, type: 'message', message: makeMessage({ id: 'm1', conversation_id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  channelListeners.clear()
  fetchConversations.mockResolvedValue()
  useChatStore.setState({ receiveMessage, fetchConversations })
  // Module-level state, so it outlives a test — clear it or one test's open
  // thread silently mutes the next one's mirror.
  resetOpenConversationForTests()
})

test('chat channel: message frames reach receiveMessage and the onMessage callback', () => {
  const onMessage = vi.fn()
  const unsubscribe = subscribeChatChannel('c1', onMessage)
  const listener = channelListeners.get('chat:c1')
  expect(listener).toBeDefined()

  listener?.(chatFrame('chat:c1'))
  expect(receiveMessage).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm1' }))
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))

  // A non-message frame on the channel is filtered.
  listener?.({ channel: 'chat:c1', type: 'escrow_event', escrow_id: 'e', event: 'X', tx_ref: 't' })
  expect(receiveMessage).toHaveBeenCalledTimes(1)

  unsubscribe()
  expect(channelListeners.has('chat:c1')).toBe(false)
})

test('user channel: a mirrored chat frame refetches conversations; a notification frame falls through', () => {
  subscribeUserChannel('me')
  const listener = channelListeners.get('user:me')
  expect(listener).toBeDefined()

  listener?.(chatFrame('user:me'))
  expect(fetchConversations).toHaveBeenCalledTimes(1)

  listener?.({
    channel: 'user:me',
    type: 'notification',
    notification: { id: 'n1', title: 'T', body: 'B' },
  })
  expect(fetchConversations).toHaveBeenCalledTimes(1) // untouched — S5.3 owns these
})

test('user channel: a failing refetch is contained (next frame or poll catches up)', () => {
  fetchConversations.mockRejectedValue(new Error('down'))
  subscribeUserChannel('me')
  expect(() => channelListeners.get('user:me')?.(chatFrame('user:me'))).not.toThrow()
})

test('user channel: no inbox refetch for the thread the reader has OPEN', () => {
  // The flicker this prevents (#47): the mirror refetched for the open thread
  // too, and the server has not marked the message read yet — that rides the
  // debounced GET /messages a second later. So the list came back with
  // unread_count=1, the rail badge ticked up and the row jumped from "Earlier"
  // into "Unread", then both undid themselves. Once per message received.
  setOpenConversation('c1')
  subscribeUserChannel('me')
  const listener = channelListeners.get('user:me')

  listener?.(chatFrame('user:me', 'c1'))
  expect(fetchConversations).not.toHaveBeenCalled()
})

test('user channel: the mirror still refetches for conversations that are NOT open', () => {
  // The other half of the same rule — the mirror exists for exactly this.
  setOpenConversation('c1')
  subscribeUserChannel('me')
  const listener = channelListeners.get('user:me')

  listener?.(chatFrame('user:me', 'c2'))
  expect(fetchConversations).toHaveBeenCalledTimes(1)
})

test('user channel: closing the thread restores the mirror for that conversation', () => {
  // useChatRealtime clears the register on unmount; without that the inbox
  // would go permanently stale for the last thread the reader visited.
  setOpenConversation('c1')
  subscribeUserChannel('me')
  const listener = channelListeners.get('user:me')

  listener?.(chatFrame('user:me', 'c1'))
  expect(fetchConversations).not.toHaveBeenCalled()

  clearOpenConversation('c1')
  listener?.(chatFrame('user:me', 'c1'))
  expect(fetchConversations).toHaveBeenCalledTimes(1)
})

test('clearing a thread that is no longer the open one is a no-op', () => {
  // Mount-before-unmount: c2 registers, then c1's cleanup runs. c1 must not
  // take c2's registration away with it, or the mirror resumes refetching for
  // a thread still on screen.
  setOpenConversation('c1')
  setOpenConversation('c2')
  clearOpenConversation('c1')

  subscribeUserChannel('me')
  const listener = channelListeners.get('user:me')
  listener?.(chatFrame('user:me', 'c2'))
  expect(fetchConversations).not.toHaveBeenCalled()
})
