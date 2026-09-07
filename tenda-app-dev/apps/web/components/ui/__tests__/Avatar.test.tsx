/**
 * Avatar: initials fallback (first + last), image when src present, the
 * optional unread dot, and the '?' fallback for empty names.
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Avatar } from '@/components/ui/Avatar'

test('renders initials from first and last word of the name', () => {
  render(<Avatar name="Ada Chidinma Okafor" />)
  expect(screen.getByText('AO')).toBeInTheDocument()
})

test('renders the image when src is given', () => {
  render(<Avatar name="Ada Okafor" src="https://cdn/a.png" />)
  expect(screen.getByAltText('Ada Okafor')).toHaveAttribute('src', 'https://cdn/a.png')
  expect(screen.queryByText('AO')).toBeNull()
})

test('unreadDot renders only when asked', () => {
  const { rerender } = render(<Avatar name="Ada" unreadDot />)
  expect(screen.getByTestId('avatar-unread-dot')).toBeInTheDocument()
  rerender(<Avatar name="Ada" />)
  expect(screen.queryByTestId('avatar-unread-dot')).toBeNull()
})

test('an empty name falls back to ?', () => {
  render(<Avatar name="  " />)
  expect(screen.getByText('?')).toBeInTheDocument()
})
