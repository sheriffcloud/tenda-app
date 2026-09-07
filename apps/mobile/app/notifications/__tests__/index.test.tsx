/**
 * Notification centre screen (Stage 5/7). The screen is glue over tested units
 * (store, NotificationRow, notificationRoute); this asserts the wiring: it loads
 * the feed on mount, a tapped notice marks-read AND deep-links via its data bag,
 * the header clears all, and an empty feed shows the empty state. The real
 * NotificationRow is used so the row→handler path is exercised end to end.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { NotificationWire } from '@tenda/shared'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#eee', background: '#fff' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#05f' },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({
  Bell: () => null, CheckCheck: () => null, Handshake: () => null,
  ArrowLeftRight: () => null, Scale: () => null, Megaphone: () => null,
}))
jest.mock('@/lib/date', () => ({ formatRelativeShort: () => '2h ago' }))
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
const mockFetchFeed = jest.fn()
const mockNotif: NotificationWire = {
  id: 'n1', title: 'Gig accepted', body: 'Your gig was accepted',
  data: { screen: 'escrow', escrowId: 'e1', kind: 'gig' }, read_at: null, created_at: '2026-01-01T00:00:00.000Z',
}
const mockStore = {
  notifications: [mockNotif] as NotificationWire[],
  announcements: [] as unknown[],
  unread: 1,
  loading: false,
  markRead: mockMarkRead,
  markAllRead: mockMarkAllRead,
  fetchFeed: mockFetchFeed,
  fetchMore: jest.fn(),
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
  mockStore.loading = false
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
