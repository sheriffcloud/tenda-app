/**
 * Kind-aware badges over the SHARED vocabulary: the same status reads
 * differently per kind ('submitted' = review for gigs, in-payment for
 * exchange), and every status resolves a variant.
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EXCHANGE_STATUS_LABEL, STATUS_LABEL } from '@tenda/shared'
import { EscrowStatusBadge, ExchangeStatusBadge, GigStatusBadge } from '@/components/escrow/StatusBadge'

test('gig vs exchange flavour the same status differently', () => {
  render(<GigStatusBadge status="submitted" />)
  expect(screen.getByText(STATUS_LABEL.submitted)).toBeInTheDocument()

  render(<ExchangeStatusBadge status="submitted" />)
  expect(screen.getByText(EXCHANGE_STATUS_LABEL.submitted)).toBeInTheDocument()
})

test('the kind-aware wrapper dispatches to the right table', () => {
  render(<EscrowStatusBadge status="accepted" kind="exchange" />)
  expect(screen.getByText(EXCHANGE_STATUS_LABEL.accepted)).toBeInTheDocument()
  render(<EscrowStatusBadge status="accepted" kind="gig" />)
  expect(screen.getByText(STATUS_LABEL.accepted)).toBeInTheDocument()
})
