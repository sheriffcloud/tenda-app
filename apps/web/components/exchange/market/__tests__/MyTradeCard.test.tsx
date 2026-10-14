/**
 * A row of "My trades".
 *
 * The first test is the bug this row replaced: `/v1/users/:id/escrows` answers
 * `EscrowListRow`, whose `title` is `gig_details.title` and therefore NULL for
 * every exchange. The previous row printed that field, so the whole list had
 * blank headlines.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EscrowListRow } from '@tenda/shared'
import { MyTradeCard } from '@/components/exchange/market'
import { EXCHANGE_COPY } from '@/components/exchange/market'

function row(over: Partial<EscrowListRow> = {}): EscrowListRow {
  return {
    id: 'exch-9',
    kind: 'exchange',
    status: 'accepted',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '50000000',
    // NULL for every exchange — the wire says so.
    title: null,
    fiat_currency: 'NGN',
    creator_id: 'me',
    counterparty_id: 'them',
    accept_deadline: null,
    created_at: '2026-08-15T10:00:00.000Z',
    ...over,
  }
}

describe('MyTradeCard', () => {
  it('headlines the MONEY, because an exchange row carries no title', () => {
    render(<MyTradeCard row={row()} userId="me" />)
    expect(screen.getByText('50 USDC')).toBeInTheDocument()
    expect(screen.getByText('NGN')).toBeInTheDocument()
  })

  it('says which side of the trade the reader is on', () => {
    const { rerender } = render(<MyTradeCard row={row({ creator_id: 'me' })} userId="me" />)
    expect(screen.getByText(new RegExp(EXCHANGE_COPY.side(true)))).toBeInTheDocument()

    rerender(<MyTradeCard row={row({ creator_id: 'someone-else' })} userId="me" />)
    expect(screen.getByText(new RegExp(EXCHANGE_COPY.side(false)))).toBeInTheDocument()
  })

  it('links its own offer and shows its status', () => {
    render(<MyTradeCard row={row()} userId="me" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/exchange/exch-9')
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('stamps the row with the instant it was listed', () => {
    // The row renders this unconditionally (#38 — escrows.created_at is NOT
    // NULL). Asserted on <time dateTime>, not the relative label, because the
    // label moves with the wall clock and the instant does not.
    const { container } = render(<MyTradeCard row={row()} userId="me" />)
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-08-15T10:00:00.000Z')
  })

  it('survives a row with no currency', () => {
    // fiat_currency is genuinely nullable (null for gigs) and must not render
    // as "null". created_at was dropped from this case in #38: the column is
    // NOT NULL, so the row this once described could never reach the client.
    const { container } = render(
      <MyTradeCard row={row({ fiat_currency: null })} userId="me" />,
    )
    expect(container.textContent).not.toContain('null')
    expect(screen.getByText('50 USDC')).toBeInTheDocument()
  })
})
