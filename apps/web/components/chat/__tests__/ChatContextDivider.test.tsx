/**
 * Context pill: gig pills LINK to the public gig detail, exchange pills
 * render unlinked until S6.4's route exists, and no escrow id means the
 * DIRECT MESSAGE pill.
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ChatContextDivider } from '@/components/chat/ChatContextDivider'

test('a gig context links to the gig detail with its title', () => {
  render(<ChatContextDivider escrowId="e1" escrowTitle="Paint my fence" kind="gig" />)
  const link = screen.getByRole('link', { name: 'Open gig: Paint my fence' })
  expect(link).toHaveAttribute('href', '/gig/e1')
  expect(screen.getByText('GIG')).toBeInTheDocument()
})

test('an exchange context renders the pill WITHOUT a link (route lands in S6.4)', () => {
  render(<ChatContextDivider escrowId="e2" escrowTitle="Swap USDC" kind="exchange" />)
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.getByText('TRADE')).toBeInTheDocument()
  expect(screen.getByText('Swap USDC')).toBeInTheDocument()
})

test('no escrow id renders the DIRECT MESSAGE pill', () => {
  render(<ChatContextDivider escrowId={null} />)
  expect(screen.getByText('DIRECT MESSAGE')).toBeInTheDocument()
  expect(screen.queryByRole('link')).toBeNull()
})

test('a context without a title falls back to the kind-appropriate label', () => {
  render(<ChatContextDivider escrowId="e3" kind="gig" />)
  expect(screen.getByRole('link', { name: 'Open gig: View gig' })).toBeInTheDocument()
})
