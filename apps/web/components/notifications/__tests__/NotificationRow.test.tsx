/**
 * Row rendering: unread carries the brand dot, the weight and the aria
 * suffix; a read row keeps its place in the list with neither.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { NotificationWire } from '@tenda/shared'
import { NotificationRow } from '@/components/notifications/NotificationRow'

function notice(over: Partial<NotificationWire> = {}): NotificationWire {
  return {
    id: 'n1',
    title: 'Gig accepted',
    body: 'Bola accepted your gig',
    data: { screen: 'escrow', escrowId: 'e1', kind: 'gig' },
    read_at: null,
    created_at: '2026-08-15T10:00:00.000Z',
    ...over,
  }
}

test('unread row: brand dot, weighted title, aria suffix, click fires', async () => {
  const onPress = vi.fn()
  render(<NotificationRow notification={notice()} onPress={onPress} />)
  const row = screen.getByRole('button', { name: 'Gig accepted, unread' })
  expect(screen.getByTestId('notification-unread-dot').className).toContain('bg-brand-primary')
  expect(screen.getByText('Gig accepted').className).toContain('font-semibold')
  expect(screen.getByText('Bola accepted your gig')).toBeInTheDocument()
  await userEvent.click(row)
  expect(onPress).toHaveBeenCalled()
})

test('read row: no unread dot, no weight, plain aria label', () => {
  render(
    <NotificationRow notification={notice({ read_at: '2026-08-15T11:00:00.000Z' })} onPress={vi.fn()} />,
  )
  expect(screen.getByRole('button', { name: 'Gig accepted' })).toBeInTheDocument()
  expect(screen.queryByTestId('notification-unread-dot')).toBeNull()
  expect(screen.getByText('Gig accepted').className).not.toContain('font-semibold')
})

test('stamps the row with the instant the notice arrived', () => {
  // Rendered unconditionally since #38 (notifications.created_at is NOT NULL).
  // <time dateTime> is the stable half; the relative label moves with the clock.
  const { container } = render(<NotificationRow notification={notice()} onPress={vi.fn()} />)
  expect(container.querySelector('time')).toHaveAttribute('dateTime', notice().created_at)
})
