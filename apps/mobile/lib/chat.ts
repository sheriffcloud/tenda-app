import type { LocalMessage } from '@/stores/chat.store'

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

export type FeedItem = LocalMessage | ContextDividerItem | TimestampGroupItem

export function isDivider(item: FeedItem): item is ContextDividerItem {
  return '_type' in item && item._type === 'divider'
}

export function isTimestamp(item: FeedItem): item is TimestampGroupItem {
  return '_type' in item && item._type === 'timestamp'
}

/**
 * Build the chat feed:
 *
 * 1. Insert a TimestampGroupItem before the first message and whenever the
 *    calendar date changes between adjacent messages (one header per day, like
 *    WhatsApp). Time-of-day grouping is intentionally avoided, it produces a
 *    header on nearly every message during active back-and-forth.
 * 2. Insert a ContextDividerItem whenever the escrow context changes between
 *    adjacent messages.
 * 3. Reverse the feed so newest is at index 0, as required by an inverted FlatList.
 */
export function buildMessageFeed(msgs: LocalMessage[]): FeedItem[] {
  const feed: FeedItem[] = []

  for (let i = 0; i < msgs.length; i++) {
    const curr = msgs[i]
    const prev = i > 0 ? msgs[i - 1] : null

    const currContext = curr.escrow_id
    const prevContext = prev ? prev.escrow_id : null

    const contextChanged = currContext !== prevContext
    const shouldDivide = contextChanged && (currContext !== null || prev !== null)

    if (shouldDivide) {
      feed.push({
        _type: 'divider',
        _key: `divider_${curr.id}`,
        escrow_id: curr.escrow_id,
        escrow_title: curr.escrow_title ?? null,
        escrow_kind: curr.escrow_kind ?? null,
      })
    }

    const currDay = curr.created_at ? new Date(curr.created_at).toDateString() : null
    const prevDay = prev?.created_at ? new Date(prev.created_at).toDateString() : null
    const newDay = currDay !== null && currDay !== prevDay

    if (newDay && curr.created_at) {
      feed.push({
        _type: 'timestamp',
        _key:  `ts_${curr.id}`,
        iso:   curr.created_at,
      })
    }

    feed.push(curr)
  }

  return feed.reverse()
}
