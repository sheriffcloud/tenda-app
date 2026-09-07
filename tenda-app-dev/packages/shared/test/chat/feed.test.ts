import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMessageFeed, isDivider, isTimestamp, type ChatFeedItem } from '../../src/chat/feed'
import type { Message } from '../../src/types/chat'

function msg(over: Partial<Message> & { id: string }): Message {
  return {
    conversation_id: 'c1',
    sender_id: 'u1',
    escrow_id: null,
    escrow_title: null,
    escrow_kind: null,
    content: 'hello',
    read_at: null,
    created_at: '2026-08-10T09:00:00.000Z',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    ...over,
  }
}

function shape(feed: ChatFeedItem<Message>[]): string[] {
  return feed.map((f) => (isDivider(f) ? `div:${f.escrow_id ?? 'dm'}` : isTimestamp(f) ? `ts:${f.iso.slice(0, 10)}` : `msg:${f.id}`))
}

test('chronological order with one day header, no divider for a direct-message-only thread', () => {
  const feed = buildMessageFeed([msg({ id: 'm1' }), msg({ id: 'm2' })])
  assert.deepEqual(shape(feed), ['ts:2026-08-10', 'msg:m1', 'msg:m2'])
})

test('a new calendar day inserts exactly one header at the boundary', () => {
  // Noon stamps 24h apart: day-distinct under every host timezone (the
  // grouping uses local toDateString, so midnight-adjacent stamps would
  // make this test depend on the machine's offset).
  const feed = buildMessageFeed([
    msg({ id: 'm1', created_at: '2026-08-10T12:00:00.000Z' }),
    msg({ id: 'm2', created_at: '2026-08-11T12:00:00.000Z' }),
    msg({ id: 'm3', created_at: '2026-08-11T12:05:00.000Z' }),
  ])
  assert.deepEqual(shape(feed), ['ts:2026-08-10', 'msg:m1', 'ts:2026-08-11', 'msg:m2', 'msg:m3'])
})

test('escrow-context changes divide: enter context, switch context, drop to DM', () => {
  const feed = buildMessageFeed([
    msg({ id: 'm1', escrow_id: 'e1', escrow_title: 'Paint', escrow_kind: 'gig' }),
    msg({ id: 'm2', escrow_id: 'e1', escrow_title: 'Paint', escrow_kind: 'gig' }),
    msg({ id: 'm3', escrow_id: 'e2', escrow_title: 'Swap', escrow_kind: 'exchange' }),
    msg({ id: 'm4' }), // back to direct message → DM divider
  ])
  assert.deepEqual(shape(feed), [
    'div:e1', 'ts:2026-08-10', 'msg:m1', 'msg:m2',
    'div:e2', 'msg:m3',
    'div:dm', 'msg:m4',
  ])
  const divider = feed.find(isDivider)
  assert.equal(divider?.escrow_title, 'Paint')
  assert.equal(divider?.escrow_kind, 'gig')
})

test('a first message with NO context gets no leading DM divider', () => {
  const feed = buildMessageFeed([msg({ id: 'm1' })])
  assert.equal(feed.some(isDivider), false)
})

test('empty input yields an empty feed', () => {
  assert.deepEqual(buildMessageFeed([]), [])
})
