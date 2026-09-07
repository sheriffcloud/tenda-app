/**
 * The notification detail pane.
 *
 * The load-bearing question is WHEN it may say "Pick a notification". That is a
 * claim about what the reader has done, and on a deep link they have already
 * done it — the feed simply has not landed. So the pane stays silent until the
 * feed has an answer, and only then reports that the id is not among it.
 *
 * These cases lived in NotificationsListColumn.test.tsx, which tests a
 * different component; they moved here in the #48 re-audit, when one of them
 * turned out to be asserting its own scaffolding (a `feedStatus: 'ready'` from
 * the column suite's beforeEach) rather than the state its name described.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTIFICATION_SCREEN, type NotificationWire } from '@tenda/shared'
import NotificationDetailPage from '@/app/(app)/notifications/[notificationId]/page'
import { useNotificationsStore } from '@/stores/notifications.store'
import { NOTIFICATIONS_LIST_COPY } from '@/components/notifications/copy'

let routeParams: { notificationId?: string } = {}
vi.mock('next/navigation', () => ({ useParams: () => routeParams }))
vi.mock('@/api/client', () => ({
  api: { notifications: { feed: vi.fn(), unreadCount: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() } },
}))

const notice = (over: Partial<NotificationWire> = {}): NotificationWire => ({
  id: 'ntf-1',
  title: 'Gig accepted',
  body: 'Bola accepted your delivery gig.',
  data: null,
  read_at: null,
  created_at: '2026-08-15T12:00:00.000Z',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  routeParams = { notificationId: 'ntf-9' }
  useNotificationsStore.getState().reset()
})
afterEach(cleanup)

describe('before the feed has an answer', () => {
  it('says nothing while the first load is in flight', () => {
    useNotificationsStore.setState({ feedStatus: 'loading', isFetchingFeed: true, notifications: [] })
    const { container } = render(<NotificationDetailPage />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says nothing before any fetch has STARTED either', () => {
    // The gap an in-flight flag alone cannot cover: on a deep link this pane
    // renders in the same commit as the list column, whose mount EFFECT starts
    // the fetch — effects run after paint, so at first render nothing is in
    // flight and the status is still 'idle'.
    const { container } = render(<NotificationDetailPage />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says nothing when the feed FAILED — the column carries that message', () => {
    // Not in flight either. The pane must not tell the reader they picked
    // nothing while the column beside it says the notices could not be loaded.
    useNotificationsStore.setState({ feedStatus: 'error', notifications: [] })
    const { container } = render(<NotificationDetailPage />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('once the feed has landed', () => {
  it('offers the empty state for an id that is genuinely not among the notices', () => {
    useNotificationsStore.setState({ feedStatus: 'ready', notifications: [] })
    render(<NotificationDetailPage />)
    expect(screen.getByText(NOTIFICATIONS_LIST_COPY.emptyDetailTitle)).toBeInTheDocument()
  })

  it('keeps that answer through a background refresh, as the store does', () => {
    // The store's whole doctrine (#48): a settled feed keeps its answer while a
    // refresh runs. The pane has to agree, or the two disagree about the same
    // feed — which is what the old in-flight-flag guard did here.
    useNotificationsStore.setState({ feedStatus: 'ready', isFetchingFeed: true, notifications: [] })
    render(<NotificationDetailPage />)
    expect(screen.getByText(NOTIFICATIONS_LIST_COPY.emptyDetailTitle)).toBeInTheDocument()
  })

  it('renders the notice it was given', () => {
    routeParams = { notificationId: 'ntf-1' }
    useNotificationsStore.setState({ feedStatus: 'ready', notifications: [notice()] })
    const { container } = render(<NotificationDetailPage />)
    expect(screen.getByText('Gig accepted')).toBeInTheDocument()
    expect(screen.getByText('Bola accepted your delivery gig.')).toBeInTheDocument()
    // The arrival instant, rendered unconditionally since #38. Asserted on
    // <time dateTime> rather than the relative label, which moves with the clock.
    expect(container.querySelector('time')).toHaveAttribute('dateTime', notice().created_at)
  })
})

describe('read-marking', () => {
  it('marks a notice read by OPENING it, not by clicking a row', async () => {
    const markRead = vi.fn<() => Promise<void>>().mockResolvedValue()
    routeParams = { notificationId: 'ntf-1' }
    useNotificationsStore.setState({ feedStatus: 'ready', notifications: [notice()], markRead })
    render(<NotificationDetailPage />)
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('ntf-1'))
  })

  it('does not re-mark a notice that is already read', () => {
    const markRead = vi.fn<() => Promise<void>>().mockResolvedValue()
    routeParams = { notificationId: 'ntf-1' }
    useNotificationsStore.setState({
      feedStatus: 'ready',
      notifications: [notice({ read_at: 'x' })],
      markRead,
    })
    render(<NotificationDetailPage />)
    expect(markRead).not.toHaveBeenCalled()
  })
})

describe('the call to action', () => {
  it('offers the route the payload names', () => {
    // The positive half, which had no case at all — the branch was uncovered
    // (page.tsx:80-82) and only the null-route side was pinned. The screen
    // VOCABULARY is shared; the table that turns it into a web path is this
    // app's own (lib/notification-route.ts), so this is the assertion that the
    // two are wired together.
    routeParams = { notificationId: 'ntf-1' }
    useNotificationsStore.setState({
      feedStatus: 'ready',
      notifications: [notice({ data: { screen: NOTIFICATION_SCREEN.escrow, escrowId: 'esc-7' } })],
    })
    render(<NotificationDetailPage />)
    expect(screen.getByRole('link', { name: NOTIFICATIONS_LIST_COPY.open })).toHaveAttribute(
      'href',
      // The workspace detail (#49) — the pane there branches by relationship,
      // so this one URL fits whichever recipient the notice reached.
      '/my-gigs/esc-7',
    )
  })

  it('says a notice has nothing to open rather than offering a dead button', () => {
    routeParams = { notificationId: 'ntf-1' }
    useNotificationsStore.setState({ feedStatus: 'ready', notifications: [notice({ data: null })] })
    render(<NotificationDetailPage />)
    expect(screen.getByText(NOTIFICATIONS_LIST_COPY.noRoute)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: NOTIFICATIONS_LIST_COPY.open })).toBeNull()
  })
})
