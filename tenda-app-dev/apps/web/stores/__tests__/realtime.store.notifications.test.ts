/**
 * S5.3 fan-in on the `user:<id>` channel: notification frames reach the
 * notifications store, malformed notification payloads are dropped by the
 * guard, and chat mirrors keep working beside them.
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

import { onPersonalEvent, subscribeUserChannel } from '@/stores/realtime.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useChatStore } from '@/stores/chat.store'

const receive = vi.fn<(n: { id: string }) => void>()
const fetchConversations = vi.fn<() => Promise<void>>()

beforeEach(() => {
  vi.clearAllMocks()
  channelListeners.clear()
  fetchConversations.mockResolvedValue()
  useNotificationsStore.setState({ receive })
  useChatStore.setState({ fetchConversations })
})

test('a notification frame feeds the notifications store', () => {
  subscribeUserChannel('me')
  channelListeners.get('user:me')?.({
    channel: 'user:me',
    type: 'notification',
    notification: { id: 'n1', title: 'Gig accepted', body: 'Bola accepted', data: null, read_at: null, created_at: null },
  })
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }))
  expect(fetchConversations).not.toHaveBeenCalled()
})

test('a malformed notification payload is dropped by the guard', () => {
  subscribeUserChannel('me')
  channelListeners.get('user:me')?.({
    channel: 'user:me',
    type: 'notification',
    notification: { id: 42, title: 'bad' }, // id not a string, body missing
  })
  expect(receive).not.toHaveBeenCalled()
})

test('chat mirrors and notification frames coexist on the one subscription', () => {
  subscribeUserChannel('me')
  const listener = channelListeners.get('user:me')
  listener?.({ channel: 'user:me', type: 'message', message: makeMessage({ id: 'm1' }) })
  expect(fetchConversations).toHaveBeenCalledTimes(1)
  expect(receive).not.toHaveBeenCalled()
})

/**
 * The personal-event fan-out is contained the same way the inbox refetch above
 * it is. It exists to carry ARBITRARY future consumers — that is the point of a
 * fan-out — so "the one listener we have today cannot throw" is not a
 * guarantee. One bad listener must not swallow the others, and must not escape
 * into the socket's frame handler, where it would take the rest of the frame.
 */
test('user channel: one throwing personal-event listener cannot silence the others', () => {
  const second = vi.fn()
  const unsubscribeFirst = onPersonalEvent(() => { throw new Error('listener blew up') })
  const unsubscribeSecond = onPersonalEvent(second)
  subscribeUserChannel('me')
  // A COMPLETE NotificationWire: the guard reads three fields, but a fixture
  // is a claim about what the server can send, and the server cannot send a
  // notice without its data/read_at/created_at. (The older fixture above
  // predates this file's typed-frame convention; left alone as out of scope.)
  const notification: WsFrame = {
    channel: 'user:me',
    type: 'notification',
    notification: {
      id: 'n1',
      title: 'T',
      body: 'B',
      data: null,
      read_at: null,
      created_at: '2026-08-25T00:00:00.000Z',
    },
  }

  expect(() => channelListeners.get('user:me')?.(notification)).not.toThrow()
  expect(second).toHaveBeenCalledTimes(1)

  unsubscribeFirst()
  unsubscribeSecond()
})

