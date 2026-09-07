/**
 * One order-book row.
 *
 * Most of these assert an ABSENCE, and that is the point: the comp draws a
 * rank, a "Best" badge, a trade count, a completion meter, a verified tick and
 * the seller's payment rails, and not one of those exists on `ExchangeSummary`.
 * Drawing them would have meant inventing them — the same mistake the #17
 * review caught with an applicant count.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OFFER_CARD_COPY, OfferCard } from '@/components/exchange/market'
import { makeExchangeDetail, makeUserRef } from '../../../../test/factories/exchange'

const offer = (over: Parameters<typeof makeExchangeDetail>[0] = {}) => makeExchangeDetail(over)

describe('OfferCard', () => {
  it('is one link to the offer — the whole card, not a button inside it', () => {
    render(<OfferCard offer={offer()} />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/exchange/exch-1')
    // The CTA looks like a button and must not BE one: a second tab stop to
    // the place the card already goes.
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(OFFER_CARD_COPY.cta)).toBeInTheDocument()
  })

  it('states the rate, its pair, and both sides of the trade', () => {
    render(<OfferCard offer={offer()} />)
    expect(screen.getByText('NGN / USDC')).toBeInTheDocument()
    expect(screen.getByText('₦1,500')).toBeInTheDocument()
    expect(screen.getByText(OFFER_CARD_COPY.forSale('50 USDC'))).toBeInTheDocument()
    expect(screen.getByText(OFFER_CARD_COPY.total('₦75,000'))).toBeInTheDocument()
  })

  it('names the settlement chain, because a rate on the wrong network is unusable', () => {
    render(<OfferCard offer={offer()} />)
    expect(screen.getByText('Solana Devnet')).toBeInTheDocument()
  })

  it('says how long the payment window is', () => {
    render(<OfferCard offer={offer({ payment_window_seconds: 5_400 })} />)
    expect(screen.getByText(/Pay within 1h 30m/)).toBeInTheDocument()
  })

  it('shows a rating only when the trader HAS one', () => {
    const { rerender } = render(
      <OfferCard offer={offer({ creator: makeUserRef({ id: 's', review_score: '4.70' }) })} />,
    )
    expect(screen.getByRole('img', { name: '4.7 out of 5' })).toBeInTheDocument()
    expect(screen.getByText('4.7')).toBeInTheDocument()

    // Not "0.0 stars", which reads as a bad trader rather than a new one.
    rerender(<OfferCard offer={offer({ creator: makeUserRef({ id: 's', review_score: null }) })} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText(OFFER_CARD_COPY.unrated)).toBeInTheDocument()
  })

  it('names the trader’s country, falling back to the raw code', () => {
    const { rerender } = render(
      <OfferCard offer={offer({ creator: makeUserRef({ id: 's', country: 'NG' }) })} />,
    )
    expect(screen.getByText('Nigeria')).toBeInTheDocument()

    rerender(<OfferCard offer={offer({ creator: makeUserRef({ id: 's', country: 'ZW' }) })} />)
    expect(screen.getByText('ZW')).toBeInTheDocument()
  })

  it('renders no country line at all when the account carries none', () => {
    render(<OfferCard offer={offer({ creator: makeUserRef({ id: 's', country: null }) })} />)
    expect(screen.queryByText('—')).toBeNull()
  })

  it('falls back to a neutral noun rather than an empty name', () => {
    render(
      <OfferCard
        offer={offer({ creator: makeUserRef({ id: 's', first_name: '', last_name: '' }) })}
      />,
    )
    expect(screen.getByText(OFFER_CARD_COPY.anonymous)).toBeInTheDocument()
  })

  it('claims no reputation the wire does not carry', () => {
    const { container } = render(<OfferCard offer={offer()} />)
    const text = container.textContent ?? ''
    for (const invented of ['trades', 'completion', 'Best', 'replies', 'Verified']) {
      expect(text).not.toContain(invented)
    }
    // No rank either: the book is ordered by listing time, not by rate.
    expect(text).not.toContain('01')
  })

  it('does not advertise the seller’s payment rails — they are party-scoped', () => {
    // `payout_account` is nulled by the server for anyone outside the trade,
    // so a row naming a bank would be publishing the withheld field.
    const { container } = render(
      <OfferCard
        offer={offer({
          payout_account: {
            kind: 'bank',
            bank_code: '058',
            account_number: '0123456789',
            // Deliberately NOT the seller's own name, which the row does show:
            // this has to fail when the rails leak, not when the trader is
            // named.
            account_name: 'Zenith Current Account',
            country: 'NG',
          },
        })}
      />,
    )
    expect(container.textContent).not.toContain('0123456789')
    expect(container.textContent).not.toContain('Zenith')
  })

  it('marks a Seeker seller, which IS on the wire', () => {
    render(<OfferCard offer={offer({ creator: makeUserRef({ id: 's', is_seeker: true }) })} />)
    expect(screen.getByText(OFFER_CARD_COPY.seeker)).toBeInTheDocument()
  })
})

describe('OfferCard — the rate is compared, not just displayed', () => {
  it('keeps two close rates DISTINGUISHABLE in the column', () => {
    // The card's own copy tells readers to compare rates straight down the
    // column. Rounded to whole units — which is right for a total and wrong
    // for a rate — GHS 15.40 and 15.49 both printed "GH₵15".
    const at = (rate: string) =>
      render(<OfferCard offer={offer({ rate, fiat_currency: 'GHS' })} />).container.textContent ?? ''
    const low = at('15.4000000000')
    const high = at('15.4900000000')
    expect(low).toContain('GH₵15.40')
    expect(high).toContain('GH₵15.49')
    expect(low).not.toEqual(high)
  })

  it('leaves a whole rate whole — most NGN rates are, and ₦1,500.00 is noise', () => {
    render(<OfferCard offer={offer()} />)
    expect(screen.getByText('₦1,500')).toBeInTheDocument()
  })
})
