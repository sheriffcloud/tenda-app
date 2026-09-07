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
jest.mock('@/lib/date', () => ({ formatRelativeShort: () => '2h ago' }))
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

test('an unread notice is announced as unread', () => {
  render(<NotificationRow notification={notif({ read_at: null })} onPress={jest.fn()} />)
  expect(screen.getByLabelText('Gig accepted, unread')).toBeTruthy()
})

test('a read notice drops the unread marker from its label', () => {
  render(<NotificationRow notification={notif({ read_at: '2026-01-02T00:00:00.000Z' })} onPress={jest.fn()} />)
  expect(screen.getByLabelText('Gig accepted')).toBeTruthy()
  expect(screen.queryByLabelText('Gig accepted, unread')).toBeNull()
})
