/**
 * Notification centre screen (Stage 5/7). The screen is glue over tested units
 * (store, NotificationRow, notificationRoute); this asserts the wiring: it loads
 * the feed on mount, a tapped notice marks-read AND deep-links via its data bag,
 * the header clears all, and an empty feed shows the empty state. The real
 * NotificationRow is used so the row→handler path is exercised end to end.
 */
import { FlatList, RefreshControl } from 'react-native'
import { act, render, fireEvent, screen } from '@testing-library/react-native'
import type { LoadStatus, NotificationWire } from '@tenda/shared'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#eee', background: '#fff' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#05f' },
        // Needed the moment a case renders a real AnnouncementCard; the mock
        // had only ever been asked for the keys the notice rows use.
        border: { subtle: '#ddd', default: '#ccc' },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({
  Bell: () => null, CheckCheck: () => null, Handshake: () => null,
  ArrowLeftRight: () => null, Scale: () => null, Megaphone: () => null,
}))
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  formatRelativeShort: () => '2h ago',
}))
jest.mock('@/components/ui', () => {
  const { View, Pressable, Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Spacer: () => null,
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    Header: ({ rightIcon, onRightPress }: { rightIcon?: unknown; onRightPress?: () => void }) =>
      rightIcon ? (
        <Pressable accessibilityLabel="mark all read" onPress={onRightPress}>
          <Text>mark all</Text>
        </Pressable>
      ) : null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  }
})

const mockMarkRead = jest.fn()
const mockMarkAllRead = jest.fn()
const mockFetchFeed = jest.fn(async () => {})
const mockFetchMore = jest.fn()
const mockNotif: NotificationWire = {
  id: 'n1', title: 'Gig accepted', body: 'Your gig was accepted',
  data: { screen: 'escrow', escrowId: 'e1', kind: 'gig' }, read_at: null, created_at: '2026-01-01T00:00:00.000Z',
}
const mockStore = {
  notifications: [mockNotif] as NotificationWire[],
  announcements: [] as unknown[],
  unread: 1,
  // Two fields, two questions (#57): `feedStatus` is what the surface may
  // claim, `isFetchingFeed` is merely whether a request is running.
  feedStatus: 'ready' as LoadStatus,
  isFetchingFeed: false,
  markRead: mockMarkRead,
  markAllRead: mockMarkAllRead,
  fetchFeed: mockFetchFeed,
  fetchMore: mockFetchMore,
}
jest.mock('@/stores/notifications.store', () => ({
  useNotificationsStore: Object.assign(
    (sel: (s: typeof mockStore) => unknown) => sel(mockStore),
    { getState: () => mockStore },
  ),
}))

import NotificationsScreen from '@/app/notifications/index'

beforeEach(() => {
  jest.clearAllMocks()
  mockStore.notifications = [mockNotif]
  mockStore.announcements = []
  mockStore.unread = 1
  mockStore.feedStatus = 'ready'
  mockStore.isFetchingFeed = false
})

test('loads the feed on mount', () => {
  render(<NotificationsScreen />)
  expect(mockFetchFeed).toHaveBeenCalledTimes(1)
})

test('tapping a notification marks it read and deep-links via its data bag', () => {
  render(<NotificationsScreen />)
  fireEvent.press(screen.getByLabelText('Gig accepted, unread'))
  expect(mockMarkRead).toHaveBeenCalledWith('n1')
  expect(mockPush).toHaveBeenCalledWith('/gig/e1')
})

test('the header action clears everything', () => {
  render(<NotificationsScreen />)
  fireEvent.press(screen.getByLabelText('mark all read'))
  expect(mockMarkAllRead).toHaveBeenCalledTimes(1)
})

test('an empty feed shows the empty state', () => {
  mockStore.notifications = []
  mockStore.unread = 0
  render(<NotificationsScreen />)
  expect(screen.getByText('No notifications yet')).toBeTruthy()
})

test('a refresh over a settled EMPTY feed leaves the empty state standing', () => {
  // The blink (#57). The screen used to withdraw the empty state whenever a
  // request was in flight, so on an account with no notifications every
  // pull-to-refresh made "No notifications yet" vanish and come back. A settled
  // feed keeps its answer: the status stays 'ready' while the refresh runs.
  mockStore.notifications = []
  mockStore.unread = 0
  mockStore.feedStatus = 'ready'
  mockStore.isFetchingFeed = true

  render(<NotificationsScreen />)
  expect(screen.getByText('No notifications yet')).toBeTruthy()
})

test('a FIRST load claims nothing yet — no empty state before the feed has an answer', () => {
  // The other side of the same rule: "nothing yet" must not be said before the
  // first answer arrives, which is what makes the guard a status and not a flag.
  mockStore.notifications = []
  mockStore.unread = 0
  mockStore.feedStatus = 'loading'
  mockStore.isFetchingFeed = true

  render(<NotificationsScreen />)
  expect(screen.queryByText('No notifications yet')).toBeNull()
})

test('the pull-to-refresh spinner stands in for a first load, but not for a settled refresh', () => {
  // This screen has no other loading affordance, so the RefreshControl doubles
  // as one on first load. A refresh over a settled feed must NOT present itself
  // as a pull the reader never made.
  mockStore.notifications = []
  mockStore.feedStatus = 'loading'
  mockStore.isFetchingFeed = true
  const first = render(<NotificationsScreen />)
  expect(first.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true)
  first.unmount()

  mockStore.feedStatus = 'ready'
  mockStore.isFetchingFeed = true
  const settled = render(<NotificationsScreen />)
  expect(settled.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false)
})

test('pull-to-refresh reloads the feed', async () => {
  // The RefreshControl is this screen's only refresh affordance; its handler
  // was the one path the suite never drove.
  const view = render(<NotificationsScreen />)
  const control = view.UNSAFE_getByType(RefreshControl)
  mockFetchFeed.mockClear()

  // Awaited inside act: the handler flips `refreshing` on either side of the
  // fetch, and an un-acted update here would be a 25th entry on #62's list.
  await act(async () => {
    await control.props.onRefresh()
  })

  expect(mockFetchFeed).toHaveBeenCalledTimes(1)
})

test('reaching the end asks for the next page', () => {
  // Cursor pagination is the store's, but the screen has to actually ask.
  const view = render(<NotificationsScreen />)
  const list = view.UNSAFE_getByType(FlatList)

  list.props.onEndReached()

  expect(mockFetchMore).toHaveBeenCalledTimes(1)
})

test('a pinned announcement renders, and an announcements-only feed is NOT empty', () => {
  // Two things at once, both previously unexercised: the pinned-broadcast
  // branch, and the third conjunct of `empty` — a feed with no personal notices
  // but a live announcement has something to show and must not claim otherwise.
  mockStore.notifications = []
  mockStore.unread = 0
  mockStore.feedStatus = 'ready'
  mockStore.announcements = [
    { id: 'a1', title: 'Scheduled maintenance', body: 'Withdrawals pause on Sunday.', priority: 1, published_at: null, expires_at: null },
  ]

  render(<NotificationsScreen />)
  expect(screen.queryByText('No notifications yet')).toBeNull()
})

test('a notice with nothing to open marks read but does NOT navigate', () => {
  // notificationRoute answers null for a payload naming no reachable screen.
  // The row must still clear its unread state; what it must not do is push a
  // route that does not exist.
  mockStore.notifications = [{ ...mockNotif, id: 'n9', data: null }]
  render(<NotificationsScreen />)

  fireEvent.press(screen.getByLabelText('Gig accepted, unread'))

  expect(mockMarkRead).toHaveBeenCalledWith('n9')
  expect(mockPush).not.toHaveBeenCalled()
})
