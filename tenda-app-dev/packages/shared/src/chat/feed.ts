/**
 * Chat feed construction — moved from apps/mobile/lib/chat.ts (S5.2
 * anti-drift: both clients render the same divider/day-header structure).
 *
 * Returns CHRONOLOGICAL order (oldest first). Mobile reverses the result
 * at its call site for the inverted FlatList; web renders it as-is with
 * newest at the bottom.
 */
import type { Message } from '../types/chat'

export type ContextDividerItem = {
  _type: 'divider'
  _key: string
  escrow_id: string | null
  escrow_title: string | null
  escrow_kind: 'gig' | 'exchange' | null
}

export type TimestampGroupItem = {
  _type: 'timestamp'
  _key: string
  /** ISO string of the first message in this group */
  iso: string
}

/** Generic over the client's message type (e.g. an optimistic LocalMessage). */
export type ChatFeedItem<M extends Message = Message> = M | ContextDividerItem | TimestampGroupItem

export function isDivider<M extends Message>(item: ChatFeedItem<M>): item is ContextDividerItem {
  return '_type' in item && item._type === 'divider'
}

export function isTimestamp<M extends Message>(item: ChatFeedItem<M>): item is TimestampGroupItem {
  return '_type' in item && item._type === 'timestamp'
}

/**
 * Build the chat feed, oldest first:
 *
 * 1. Insert a TimestampGroupItem before the first message and whenever the
 *    calendar date changes between adjacent messages (one header per day, like
 *    WhatsApp). Time-of-day grouping is intentionally avoided, it produces a
 *    header on nearly every message during active back-and-forth.
 * 2. Insert a ContextDividerItem whenever the escrow context changes between
 *    adjacent messages.
 */
export function buildMessageFeed<M extends Message>(msgs: M[]): ChatFeedItem<M>[] {
  const feed: ChatFeedItem<M>[] = []

  for (let i = 0; i < msgs.length; i++) {
    const curr = msgs[i]
    const prev = i > 0 ? msgs[i - 1] : null

    const currContext = curr.escrow_id
    const prevContext = prev ? prev.escrow_id : null

    // A change is sufficient: if curr's context is null, the change implies
    // prev existed with one (dropping to DM divides); if curr's is set, the
    // first disjunct of mobile's old guard held anyway. The historical
    // `&& (currContext !== null || prev !== null)` was a tautology.
    const shouldDivide = currContext !== prevContext

    if (shouldDivide) {
      feed.push({
        _type: 'divider',
        _key: `divider_${curr.id}`,
        escrow_id: curr.escrow_id,
        escrow_title: curr.escrow_title ?? null,
        escrow_kind: curr.escrow_kind ?? null,
      })
    }

    // Every message carries a timestamp (messages.created_at is NOT NULL), so
    // the first message always opens a day header and no message can fall
    // between two. This used to guard `created_at` for null on both sides and
    // again before pushing — the wire type said `string | null` and the column
    // never was (#38). Only `prev` is genuinely absent, on the first item.
    const currDay = new Date(curr.created_at).toDateString()
    const prevDay = prev === null ? null : new Date(prev.created_at).toDateString()
    const newDay = currDay !== prevDay

    if (newDay) {
      feed.push({
        _type: 'timestamp',
        _key: `ts_${curr.id}`,
        iso: curr.created_at,
      })
    }

    feed.push(curr)
  }

  return feed
}
