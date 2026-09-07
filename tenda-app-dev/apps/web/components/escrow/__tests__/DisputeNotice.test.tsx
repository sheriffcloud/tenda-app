/**
 * The ONE dispute affordance (#51) — its whole contract is two questions:
 * does the reason always show, and does the mediation door open ONLY for a
 * party. The three surfaces that compose it test their own gating; this file
 * guards the component's isParty split itself.
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DISPUTE_NOTICE_COPY, DisputeNotice } from '@/components/escrow/DisputeNotice'

test('a party gets the reason AND the door into mediation', () => {
  render(<DisputeNotice reason="Package never arrived" escrowId="escrow-1" isParty />)
  expect(screen.getByText(DISPUTE_NOTICE_COPY.title)).toBeInTheDocument()
  expect(screen.getByText('Package never arrived')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: DISPUTE_NOTICE_COPY.openThread })).toHaveAttribute(
    'href',
    '/dispute/escrow-1',
  )
})

test('an outsider gets the reason but NEVER the door', () => {
  // The mediation thread is parties-only server-side; offering the link would
  // walk a reader into a 403 dressed as an affordance.
  render(<DisputeNotice reason="Package never arrived" escrowId="escrow-1" isParty={false} />)
  expect(screen.getByText('Package never arrived')).toBeInTheDocument()
  expect(screen.queryByRole('link')).toBeNull()
})
