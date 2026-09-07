/**
 * WS notification-frame guard (Stage 5) — isNotificationFrame decides whether a
 * `user:<id>` frame feeds the notification centre. A malformed frame must be
 * rejected (it would otherwise push a bad row + inflate the badge). ws + api are
 * mocked so importing realtime.store pulls no native transport.
 */
jest.mock('@/lib/ws', () => ({
  ws: { subscribe: jest.fn(() => () => {}), onConnectionChange: jest.fn() },
}))
jest.mock('@/api/client', () => ({
  api: {
    notifications: { feed: jest.fn(), unreadCount: jest.fn() },
    conversations: { list: jest.fn() },
  },
}))

import { isNotificationFrame } from '@/stores/realtime.store'

const wire = { id: 'n1', title: 't', body: 'b', data: null, read_at: null, created_at: null }

function frame(over: Record<string, unknown>): object {
  return { channel: 'user:u1', ...over }
}

test('accepts a well-formed notification frame', () => {
  expect(isNotificationFrame(frame({ type: 'notification', notification: wire }))).toBe(true)
})

test('rejects a non-notification type', () => {
  expect(isNotificationFrame(frame({ type: 'message', notification: wire }))).toBe(false)
})

test('rejects a notification frame with no payload', () => {
  expect(isNotificationFrame(frame({ type: 'notification' }))).toBe(false)
})

test('rejects a payload missing required string fields', () => {
  expect(isNotificationFrame(frame({ type: 'notification', notification: { id: 'n1' } }))).toBe(false)
})

test('rejects a non-object payload', () => {
  expect(isNotificationFrame(frame({ type: 'notification', notification: 'nope' }))).toBe(false)
})
