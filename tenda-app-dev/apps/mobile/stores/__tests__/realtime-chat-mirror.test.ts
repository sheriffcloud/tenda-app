/**
 * The `user:<id>` inbox mirror, and the one conversation it must leave alone.
 *
 * The server mirrors every chat message onto the recipient's user channel so
 * the conversations list and its badge stay current without polling. For the
 * thread the reader has OPEN that mirror is both a wasted request and visibly
 * wrong, which is what these cases pin (#56 — web's #47, same shape).
 *
 * ws + api are mocked so importing realtime.store pulls no native transport,
 * matching realtime-notifications.test.ts beside it.
 */
const mockChannelListeners = new Map<string, (frame: WsFrame) => void>()

jest.mock('@/lib/ws', () => ({
  ws: {
    subscribe: jest.fn((channel: string, listener: (frame: WsFrame) => void) => {
      mockChannelListeners.set(channel, listener)
      return () => mockChannelListeners.delete(channel)
    }),
    onConnectionChange: jest.fn(),
  },
}))
jest.mock('@/api/client', () => ({
  api: {
    notifications: { feed: jest.fn(), unreadCount: jest.fn() },
    conversations: { list: jest.fn() },
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
import { useNotificationsStore } from '@/stores/notifications.store'
import { notif } from '../__fixtures__/notifications'
import type { Message } from '@tenda/shared'
// Type-only: jest.mock replaces the runtime module, but the frame shape the
// listener really receives is this one — typing the fixture against it is what
// stops a case asserting on a frame the transport could never deliver.
import type { WsFrame } from '@/lib/ws'

const receiveMessage = jest.fn<void, [string, Message]>()
const fetchConversations = jest.fn<Promise<void>, []>()

function message(conversation_id: string): Message {
  return {
    id: 'm1',
    conversation_id,
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

function chatFrame(channel: string, conversation_id = 'c1'): WsFrame {
  return { channel, type: 'message', message: message(conversation_id) }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockChannelListeners.clear()
  fetchConversations.mockResolvedValue()
  useChatStore.setState({ receiveMessage, fetchConversations })
  // Module-level state, so it outlives a test — clear it or one test's open
  // thread silently mutes the next one's mirror.
  resetOpenConversationForTests()
  useNotificationsStore.getState().reset()
})

test('chat channel: message frames reach receiveMessage', () => {
  const unsubscribe = subscribeChatChannel('c1')
  mockChannelListeners.get('chat:c1')?.(chatFrame('chat:c1'))
  expect(receiveMessage).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm1' }))

  // A non-message frame on the channel is filtered.
  mockChannelListeners.get('chat:c1')?.({ channel: 'chat:c1', type: 'escrow_event', escrow_id: 'e', event: 'X', tx_ref: 't' })
  expect(receiveMessage).toHaveBeenCalledTimes(1)

  unsubscribe()
  expect(mockChannelListeners.has('chat:c1')).toBe(false)
})

test('user channel: a mirrored chat frame refetches the conversations list', () => {
  subscribeUserChannel('me')
  mockChannelListeners.get('user:me')?.(chatFrame('user:me'))
  expect(fetchConversations).toHaveBeenCalledTimes(1)
})

test('user channel: a failing refetch is contained (next frame or poll catches up)', () => {
  fetchConversations.mockRejectedValue(new Error('down'))
  subscribeUserChannel('me')
  expect(() => mockChannelListeners.get('user:me')?.(chatFrame('user:me'))).not.toThrow()
})

test('user channel: NO inbox refetch for the thread the reader has OPEN', () => {
  // The flicker this prevents (#56): the mirror refetched for the open thread
  // too, and the server has not marked the message read yet — that rides the
  // debounced GET /messages a second later. So the list came back with
  // unread_count=1, and because the Messages screen groups by unread the row
  // jumped from "Earlier" into "Unread" and the subtitle ticked up, then both
  // undid themselves. Once per message received.
  setOpenConversation('c1')
  subscribeUserChannel('me')

  mockChannelListeners.get('user:me')?.(chatFrame('user:me', 'c1'))
  expect(fetchConversations).not.toHaveBeenCalled()
})

test('user channel: the mirror STILL refetches for conversations that are not open', () => {
  // The other half of the same rule — the mirror exists for exactly this.
  setOpenConversation('c1')
  subscribeUserChannel('me')

  mockChannelListeners.get('user:me')?.(chatFrame('user:me', 'c2'))
  expect(fetchConversations).toHaveBeenCalledTimes(1)
})

test('user channel: closing the thread restores the mirror for that conversation', () => {
  // useChatRealtime clears the register on unmount; without that the inbox
  // would go permanently stale for the last thread the reader visited.
  setOpenConversation('c1')
  subscribeUserChannel('me')

  mockChannelListeners.get('user:me')?.(chatFrame('user:me', 'c1'))
  expect(fetchConversations).not.toHaveBeenCalled()

  clearOpenConversation('c1')
  mockChannelListeners.get('user:me')?.(chatFrame('user:me', 'c1'))
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
  mockChannelListeners.get('user:me')?.(chatFrame('user:me', 'c2'))
  expect(fetchConversations).not.toHaveBeenCalled()
})

/**
 * The user channel's OTHER consumer (#70). One subscription serves two: chat
 * mirrors refresh the inbox badge, notification frames feed the bell. The
 * notification arm had no case at all — `realtime-notifications.test.ts` beside
 * this file tests the GUARD in isolation and never reaches the dispatch.
 */
test('user channel: a notification frame reaches the notification centre', () => {
  subscribeUserChannel('me')

  mockChannelListeners.get('user:me')?.({
    channel: 'user:me',
    type: 'notification',
    notification: notif('n1'),
  })

  const bell = useNotificationsStore.getState()
  expect(bell.notifications).toEqual([expect.objectContaining({ id: 'n1' })])
  // The badge is the half a list assertion misses, and the one a reader sees
  // first — `receive` bumps it only for an unread notice.
  expect(bell.unread).toBe(1)
  // And it is NOT a chat mirror, so the inbox is left alone.
  expect(fetchConversations).not.toHaveBeenCalled()
})

test('user channel: a MALFORMED notification frame is dropped, not shown', () => {
  // The guard's false arm, reached through the subscription rather than called
  // directly. Without it a bad frame pushes a row with no title or body and
  // inflates the bell — a notice the reader cannot act on or explain.
  subscribeUserChannel('me')

  // Built through JSON.parse, not a cast: `WsFrame` is a closed union of
  // WELL-FORMED frames, so a malformed one cannot be written as that type at
  // all — and that gap is the whole reason the guard exists. This is also the
  // real path, since lib/ws parses whatever arrives off the socket.
  mockChannelListeners.get('user:me')?.(
    JSON.parse('{"channel":"user:me","type":"notification","notification":{"id":"n1"}}'),
  )

  const bell = useNotificationsStore.getState()
  expect(bell.notifications).toEqual([])
  expect(bell.unread).toBe(0)
})
