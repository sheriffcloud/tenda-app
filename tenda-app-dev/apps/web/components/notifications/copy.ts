/**
 * The notification column's strings.
 *
 * The detail pane's copy is here too: a notice is a short thing, and splitting
 * "what the list says when empty" from "what the pane says when nothing is
 * open" across two files is how the two end up describing different products.
 */
export const NOTIFICATIONS_LIST_COPY = {
  surface: {
    title: 'Notifications',
    emptyTitle: 'Nothing new',
    emptyBody: 'Escrow changes, applications and dispute replies land here.',
  },
  /** The comp's line: unread first, because that is what the badge counted. */
  count: (unread: number, total: number) => `${unread} unread of ${total}`,
  loadMore: 'Load more',
  loadingMore: 'Loading…',
  markAllRead: 'Mark all read',
  error: 'Could not load your notifications',
  emptyDetailTitle: 'Pick a notification',
  emptyDetailBody:
    'Opening one marks it read and takes you to what it is about — the escrow, the thread, the dispute.',
  /** The detail pane's one action. */
  open: 'Open what this is about',
  /** A notice whose payload names no screen this app can route to. */
  noRoute: 'This notice has nothing to open.',
} as const
