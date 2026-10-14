/**
 * buildDisputeFeed — day headers + consecutive-sender grouping (ported from
 * mobile when the module moved here). Pure; no mocks.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDisputeFeed,
  isDisputeDay,
  type DisputeFeedItem,
  type DisputeRowItem,
} from '../../../src/utils/disputes/thread'
import type { DisputeMessage } from '../../../src/types/dispute'

function msg(id: string, sender_id: string, created_at: string): DisputeMessage {
  return {
    id,
    dispute_id: 'd1',
    sender_id,
    body: `body-${id}`,
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at,
  }
}

const chrono = (feed: DisputeFeedItem[]) => [...feed].reverse()
const rowsOf = (feed: DisputeFeedItem[]): DisputeRowItem[] =>
  feed.filter((item): item is DisputeRowItem => !isDisputeDay(item))

test('empty thread → empty feed', () => {
  assert.deepEqual(buildDisputeFeed([]), [])
})

test('single message → one day header then the message, both run flags set', () => {
  const feed = chrono(buildDisputeFeed([msg('m1', 'A', '2026-07-01T10:00:00.000Z')]))
  assert.equal(feed.length, 2)
  assert.equal(isDisputeDay(feed[0]), true)
  const row = feed[1] as DisputeRowItem
  assert.equal(row.message.id, 'm1')
  assert.equal(row.showSender, true)
  assert.equal(row.showTime, true)
})

test('consecutive same-sender run: label only first, time only last', () => {
  const feed = chrono(
    buildDisputeFeed([
      msg('m1', 'A', '2026-07-01T10:00:00.000Z'),
      msg('m2', 'A', '2026-07-01T10:01:00.000Z'),
      msg('m3', 'A', '2026-07-01T10:02:00.000Z'),
    ]),
  )
  assert.deepEqual(
    rowsOf(feed).map((row) => [row.showSender, row.showTime]),
    [
      [true, false],
      [false, false],
      [false, true],
    ],
  )
})

test('sender change starts a new run and closes the previous', () => {
  const feed = chrono(
    buildDisputeFeed([
      msg('m1', 'A', '2026-07-01T10:00:00.000Z'),
      msg('m2', 'B', '2026-07-01T10:01:00.000Z'),
    ]),
  )
  assert.deepEqual(
    rowsOf(feed).map((row) => [row.showSender, row.showTime]),
    [
      [true, true],
      [true, true],
    ],
  )
})

test('day boundary inserts a header AND closes the prior run even for same sender', () => {
  const feed = chrono(
    buildDisputeFeed([
      msg('m1', 'A', '2026-07-01T22:00:00.000Z'),
      msg('m2', 'A', '2026-07-02T09:00:00.000Z'),
    ]),
  )
  assert.deepEqual(
    feed.map((item) => (isDisputeDay(item) ? 'day' : 'msg')),
    ['day', 'msg', 'day', 'msg'],
  )
  assert.deepEqual(
    rowsOf(feed).map((row) => [row.showSender, row.showTime]),
    [
      [true, true],
      [true, true],
    ],
  )
})

test('feed is reversed for the inverted list (newest at index 0)', () => {
  const feed = buildDisputeFeed([
    msg('m1', 'A', '2026-07-01T10:00:00.000Z'),
    msg('m2', 'A', '2026-07-01T10:05:00.000Z'),
  ])
  const first = feed[0] as DisputeRowItem
  assert.equal(isDisputeDay(first), false)
  assert.equal(first.message.id, 'm2')
})
