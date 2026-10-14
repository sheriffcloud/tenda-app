/**
 * The notification centre as a list column.
 *
 * Two properties carry weight: the store owns the feed (the rail's bell badge
 * reads the same rows, so a second fetch here would re-run on every notice
 * opened), and an announcement is not a row of this list — an empty personal
 * feed must not take a pinned broadcast off the screen.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnnouncementWire, NotificationWire } from '@tenda/shared'
import { NotificationsListColumn } from '@/components/notifications/NotificationsListColumn'
import { NOTIFICATIONS_LIST_COPY } from '@/components/notifications/copy'
import { useNotificationsStore } from '@/stores/notifications.store'

let routeParams: { notificationId?: string } = {}
vi.mock('next/navigation', () => ({
  useParams: () => routeParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notifications',
}))

const fetchFeed = vi.fn<() => Promise<void>>()
const fetchMore = vi.fn<() => Promise<void>>()
const markAllRead = vi.fn<() => Promise<void>>()

const notice = (over: Partial<NotificationWire> = {}): NotificationWire => ({
  id: 'ntf-1',
  title: 'Gig accepted',
  body: 'Bola accepted your delivery gig.',
  data: null,
  read_at: null,
  created_at: '2026-08-15T12:00:00.000Z',
  ...over,
})

const announcement: AnnouncementWire = {
  id: 'ann-1',
  title: 'Scheduled maintenance',
  body: 'Withdrawals pause for an hour on Sunday.',
  priority: 1,
  published_at: '2026-08-14T09:00:00.000Z',
  expires_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  routeParams = {}
  fetchFeed.mockResolvedValue()
  useNotificationsStore.setState({
    notifications: [notice()],
    announcements: [],
    unread: 1,
    feedStatus: 'ready',
    isFetchingFeed: false,
    loadingMore: false,
    hasMore: false,
    fetchFeed,
    fetchMore,
    markAllRead,
  })
})
afterEach(cleanup)

describe('NotificationsListColumn', () => {
  it('does not refetch a feed the store already holds', () => {
    // The store is shared with the rail badge and kept current by the layout's
    // realtime hook; the slot remounts on every notice opened, so a fetch here
    // would be one request per row.
    render(<NotificationsListColumn />)
    expect(fetchFeed).not.toHaveBeenCalled()
  })

  it('loads the feed when nothing has ever landed', () => {
    useNotificationsStore.setState({ notifications: [], unread: 0 })
    render(<NotificationsListColumn />)
    expect(fetchFeed).toHaveBeenCalledTimes(1)
  })

  it('groups by day, through the SAME walker chat and the wallet feed use', () => {
    // Same day ACCUMULATES into one run; a new day opens another. Asserted as
    // an exact count of labelled runs and the rows inside them, because a
    // `>= 2` count passed even when the loop opened a fresh run per notice —
    // the day headers were then filtered away as empty and the total looked
    // right. Measured: that mutant left every case in this file green (#38).
    useNotificationsStore.setState({
      notifications: [
        notice({ id: 'a', title: 'First', created_at: '2026-08-15T12:00:00.000Z' }),
        notice({ id: 'b', title: 'Second', created_at: '2026-08-15T09:00:00.000Z' }),
        notice({ id: 'c', title: 'Third', created_at: '2026-08-11T09:00:00.000Z' }),
      ],
    })
    render(<NotificationsListColumn />)
    const runs = screen.getAllByRole('list').filter((list) => list.hasAttribute('aria-labelledby'))
    expect(runs).toHaveLength(2)
    expect(within(runs[0]).getAllByRole('listitem')).toHaveLength(2)
    expect(within(runs[1]).getAllByRole('listitem')).toHaveLength(1)
    expect(within(runs[1]).getByText('Third')).toBeInTheDocument()
  })

  it('keeps a pinned announcement on screen when there are no notices at all', () => {
    // It is not a row of this list: an empty personal feed is not a reason to
    // hide a broadcast.
    useNotificationsStore.setState({ notifications: [], announcements: [announcement], unread: 0 })
    render(<NotificationsListColumn />)
    expect(screen.getByText(announcement.title)).toBeInTheDocument()
    expect(screen.getByText(NOTIFICATIONS_LIST_COPY.surface.emptyTitle)).toBeInTheDocument()
  })

  it('says a failed feed FAILED, rather than calling the account empty', () => {
    // The store swallows the error (every caller is a badge refresh that must
    // not reject), so without a status the centre said "Nothing new" to
    // someone whose server was simply unreachable.
    useNotificationsStore.setState({ notifications: [], feedStatus: 'error', isFetchingFeed: false })
    render(<NotificationsListColumn />)
    expect(screen.getByText(NOTIFICATIONS_LIST_COPY.error)).toBeInTheDocument()
    expect(screen.queryByText(NOTIFICATIONS_LIST_COPY.surface.emptyTitle)).toBeNull()
  })

  it('does not take rows away because a background refresh failed', () => {
    useNotificationsStore.setState({ feedStatus: 'error' })
    render(<NotificationsListColumn />)
    expect(screen.getByRole('link', { name: /Gig accepted/ })).toBeInTheDocument()
    expect(screen.queryByText(NOTIFICATIONS_LIST_COPY.error)).toBeNull()
  })

  it('counts unread against the total, as the comp writes it', () => {
    render(<NotificationsListColumn />)
    expect(screen.getByText(NOTIFICATIONS_LIST_COPY.count(1, 1))).toBeInTheDocument()
  })

  it('offers mark-all only while something is unread, and drives the store', async () => {
    render(<NotificationsListColumn />)
    await userEvent.click(screen.getByRole('button', { name: NOTIFICATIONS_LIST_COPY.markAllRead }))
    expect(markAllRead).toHaveBeenCalledTimes(1)

    cleanup()
    useNotificationsStore.setState({ unread: 0, notifications: [notice({ read_at: 'x' })] })
    render(<NotificationsListColumn />)
    expect(
      screen.queryByRole('button', { name: NOTIFICATIONS_LIST_COPY.markAllRead }),
    ).toBeNull()
  })

  it('pages only while a next page may exist', async () => {
    useNotificationsStore.setState({ hasMore: true })
    render(<NotificationsListColumn />)
    await userEvent.click(screen.getByRole('button', { name: NOTIFICATIONS_LIST_COPY.loadMore }))
    expect(fetchMore).toHaveBeenCalledTimes(1)

    cleanup()
    useNotificationsStore.setState({ hasMore: false })
    render(<NotificationsListColumn />)
    expect(screen.queryByRole('button', { name: NOTIFICATIONS_LIST_COPY.loadMore })).toBeNull()
  })

  it('says it is loading, and refuses a second click, while a page is in flight', () => {
    // The control must not read "Load more" while the fetch it started is still
    // running — that invites the double submission the disabled state prevents.
    useNotificationsStore.setState({ hasMore: true, loadingMore: true })
    render(<NotificationsListColumn />)
    const button = screen.getByRole('button', { name: NOTIFICATIONS_LIST_COPY.loadingMore })
    expect(button).toBeDisabled()
    expect(screen.queryByRole('button', { name: NOTIFICATIONS_LIST_COPY.loadMore })).toBeNull()
  })

  it('marks the open notice', () => {
    routeParams = { notificationId: 'ntf-1' }
    render(<NotificationsListColumn />)
    expect(screen.getByRole('link', { name: /Gig accepted/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('shows a skeleton only before the first rows, never over them', () => {
    useNotificationsStore.setState({ isFetchingFeed: true })
    render(<NotificationsListColumn />)
    expect(screen.getByRole('link', { name: /Gig accepted/ })).toBeInTheDocument()

    cleanup()
    useNotificationsStore.setState({ isFetchingFeed: true, feedStatus: 'loading', notifications: [] })
    render(<NotificationsListColumn />)
    expect(screen.queryByText(NOTIFICATIONS_LIST_COPY.surface.emptyTitle)).toBeNull()
  })
})
