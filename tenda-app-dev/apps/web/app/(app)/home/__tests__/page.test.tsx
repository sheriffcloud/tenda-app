/**
 * /home is the dashboard (#60) — not a nothing-selected pane beside a list.
 */
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('@/components/home', () => ({ Dashboard: () => <div data-dashboard>dashboard</div> }))

import HomePage from '../page'

it('renders the dashboard and nothing else', () => {
  render(<HomePage />)
  expect(screen.getByText('dashboard')).toBeInTheDocument()
  expect(screen.queryByText('Choose an open gig')).toBeNull()
})
