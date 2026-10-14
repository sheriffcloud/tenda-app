/**
 * NotificationRow (Stage 5) — the row's only logic is unread styling (surfaced
 * on the a11y label), the data-driven icon, and press. Native + theme deps are
 * mocked so the test exercises the row, not the SDKs.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { NotificationWire } from '@tenda/shared'

import { NotificationRow } from '@/components/notifications/NotificationRow'

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
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  // Echoes its input so a test can prove WHICH field the row formats.
  formatRelativeShort: (iso: string) => `stamp:${iso}`,
}))
jest.mock('@/components/ui', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

function notif(over: Partial<NotificationWire> = {}): NotificationWire {
  return {
    id: 'n1',
    title: 'Gig accepted',
    body: 'Your gig was accepted',
    data: null,
    read_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

test('renders title + body and fires onPress', () => {
  const onPress = jest.fn()
  render(<NotificationRow notification={notif()} onPress={onPress} />)
  expect(screen.getByText('Gig accepted')).toBeTruthy()
  expect(screen.getByText('Your gig was accepted')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('Gig accepted, unread'))
  expect(onPress).toHaveBeenCalledTimes(1)
})

test('stamps the row with the instant the notice arrived', () => {
  // Rendered unconditionally since #38 (notifications.created_at is NOT NULL).
  // The mocked formatter echoes its argument, so this proves the row passes
  // `created_at` — not merely that some formatter was called.
  render(<NotificationRow notification={notif()} onPress={jest.fn()} />)
  expect(screen.getByText('stamp:2026-01-01T00:00:00.000Z')).toBeTruthy()
})

test('an unread notice is announced as unread', () => {
  render(<NotificationRow notification={notif({ read_at: null })} onPress={jest.fn()} />)
  expect(screen.getByLabelText('Gig accepted, unread')).toBeTruthy()
})

test('a read notice drops the unread marker from its label', () => {
  render(<NotificationRow notification={notif({ read_at: '2026-01-02T00:00:00.000Z' })} onPress={jest.fn()} />)
  expect(screen.getByLabelText('Gig accepted')).toBeTruthy()
  expect(screen.queryByLabelText('Gig accepted, unread')).toBeNull()
})
