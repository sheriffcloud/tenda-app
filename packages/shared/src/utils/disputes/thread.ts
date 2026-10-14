import type { DisputeMessage } from '../../types/dispute'

/** Day-header row (one per calendar date), reusing the chat day label. */
export type DisputeDayItem = { _type: 'day'; _key: string; iso: string }

/** A message row with grouping flags for label/timestamp placement. */
export interface DisputeRowItem {
  _type: 'msg'
  message: DisputeMessage
  /** First message of a consecutive same-sender run → render the sender label. */
  showSender: boolean
  /** Last message of a consecutive same-sender run (or before a day break) → render the time. */
  showTime: boolean
}

export type DisputeFeedItem = DisputeDayItem | DisputeRowItem

export function isDisputeDay(item: DisputeFeedItem): item is DisputeDayItem {
  return item._type === 'day'
}

/**
 * Build the inverted dispute-thread feed from oldest→newest messages:
 *   • one day header per calendar date (WhatsApp-style, not per message);
 *   • sender labels only at the START of a consecutive same-sender run;
 *   • timestamps only at the END of a run (or right before a day break).
 * Reversed so newest sits at index 0 for the inverted FlatList.
 */
export function buildDisputeFeed(messages: DisputeMessage[]): DisputeFeedItem[] {
  const feed: DisputeFeedItem[] = []

  for (let i = 0; i < messages.length; i++) {
    const curr = messages[i]
    const prev = i > 0 ? messages[i - 1] : null
    const next = i < messages.length - 1 ? messages[i + 1] : null

    const currDay = new Date(curr.created_at).toDateString()
    const prevDay = prev !== null ? new Date(prev.created_at).toDateString() : null
    const nextDay = next !== null ? new Date(next.created_at).toDateString() : null
    const startsNewDay = currDay !== prevDay

    if (startsNewDay) {
      feed.push({ _type: 'day', _key: `day_${curr.id}`, iso: curr.created_at })
    }

    const runStart = startsNewDay || prev?.sender_id !== curr.sender_id
    const runEnd = next === null || next.sender_id !== curr.sender_id || nextDay !== currDay

    feed.push({ _type: 'msg', message: curr, showSender: runStart, showTime: runEnd })
  }

  return feed.reverse()
}
