/**
 * The inbox column's strings.
 *
 * Separate from the thread's own copy because the list is rendered by two
 * routes (@list/messages and @list/chat) and read by the tests that drive
 * them — the same reason `AUTH_COPY` exists.
 */
export const MESSAGES_LIST_COPY = {
  surface: {
    title: 'Messages',
    emptyTitle: 'No conversations yet',
    emptyBody:
      'Message a poster from a gig, or a worker from an application — threads you start appear here.',
  },
  unread: 'Unread',
  earlier: 'Earlier',
  /** Threads, not messages: the row count is what the reader is scanning. */
  count: (threads: number) => `${threads} unread`,
  noMessages: 'No messages yet',
  error: 'Could not load your messages',
  /** The detail pane with nothing open. */
  emptyDetailTitle: 'Pick a conversation',
  emptyDetailBody:
    'Threads are between you and one other person, and carry the escrow each message was sent about.',
} as const
