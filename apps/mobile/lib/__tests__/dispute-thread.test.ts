/**
 * buildDisputeFeed — day headers + consecutive-sender grouping for the
 * inverted mediation thread. Pure; no mocks.
 */
import { buildDisputeFeed, isDisputeDay, type DisputeFeedItem } from '@/lib/dispute-thread'
import type { DisputeMessage } from '@tenda/shared'

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

/** Un-reverse for readable oldest→newest assertions. */
function chrono(feed: DisputeFeedItem[]): DisputeFeedItem[] {
  return [...feed].reverse()
}

test('empty thread → empty feed', () => {
  expect(buildDisputeFeed([])).toEqual([])
})

test('single message → one day header then the message', () => {
  const feed = chrono(buildDisputeFeed([msg('m1', 'A', '2026-07-01T10:00:00.000Z')]))
  expect(feed).toHaveLength(2)
  expect(isDisputeDay(feed[0])).toBe(true)
  const row = feed[1]
  expect(isDisputeDay(row)).toBe(false)
  if (!isDisputeDay(row)) {
    expect(row.message.id).toBe('m1')
    // A lone message is both the start and end of its run.
    expect(row.showSender).toBe(true)
    expect(row.showTime).toBe(true)
  }
})

test('consecutive same-sender run: label only first, time only last', () => {
  const feed = chrono(
    buildDisputeFeed([
      msg('m1', 'A', '2026-07-01T10:00:00.000Z'),
      msg('m2', 'A', '2026-07-01T10:01:00.000Z'),
      msg('m3', 'A', '2026-07-01T10:02:00.000Z'),
    ]),
  )
  // [day, m1, m2, m3]
  const rows = feed.filter((i): i is Exclude<DisputeFeedItem, { _type: 'day' }> => !isDisputeDay(i))
  expect(rows.map((r) => [r.showSender, r.showTime])).toEqual([
    [true, false],
    [false, false],
    [false, true],
  ])
})

test('sender change starts a new run and closes the previous', () => {
  const feed = chrono(
    buildDisputeFeed([
      msg('m1', 'A', '2026-07-01T10:00:00.000Z'),
      msg('m2', 'B', '2026-07-01T10:01:00.000Z'),
    ]),
  )
  const rows = feed.filter((i): i is Exclude<DisputeFeedItem, { _type: 'day' }> => !isDisputeDay(i))
  expect(rows.map((r) => [r.showSender, r.showTime])).toEqual([
    [true, true], // A: alone in its run
    [true, true], // B: alone in its run
  ])
})

test('day boundary inserts a header AND closes the prior run even for same sender', () => {
  const feed = chrono(
    buildDisputeFeed([
      msg('m1', 'A', '2026-07-01T22:00:00.000Z'),
      msg('m2', 'A', '2026-07-02T09:00:00.000Z'),
    ]),
  )
  // [day1, m1, day2, m2]
  expect(feed.map((i) => (isDisputeDay(i) ? 'day' : 'msg'))).toEqual(['day', 'msg', 'day', 'msg'])
  const rows = feed.filter((i): i is Exclude<DisputeFeedItem, { _type: 'day' }> => !isDisputeDay(i))
  // m1 must show its time (run closed by the day break), m2 opens a fresh run.
  expect(rows.map((r) => [r.showSender, r.showTime])).toEqual([
    [true, true],
    [true, true],
  ])
})

test('feed is reversed for the inverted list (newest at index 0)', () => {
  const feed = buildDisputeFeed([
    msg('m1', 'A', '2026-07-01T10:00:00.000Z'),
    msg('m2', 'A', '2026-07-01T10:05:00.000Z'),
  ])
  const first = feed[0]
  expect(isDisputeDay(first)).toBe(false)
  if (!isDisputeDay(first)) expect(first.message.id).toBe('m2')
})
