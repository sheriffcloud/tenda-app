/**
 * The trader card — "the person on the other side".
 *
 * The comp's stat grid reads: average rating, trades settled, completion rate,
 * replies within 4 min, and a "verified" tick past 150 trades. One of those
 * five is on the wire. So the recurring assertion here is an ABSENCE: a page
 * where a reader decides whether to send a stranger money must not invent that
 * stranger's trading record.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OFFER_DETAIL_COPY, TRADER_CARD_COPY, TraderCard } from '@/components/exchange/detail'
import { makeExchangeDetail, makeUserRef } from '../../../../test/factories/exchange'

// Standing is its own fetch and renders nothing until it lands; the card's
// contract here is what IT draws.
vi.mock('@/hooks/profile/useStanding', () => ({ useUserStanding: () => null }))

describe('TraderCard', () => {
  const offer = makeExchangeDetail()

  it('shows the rating it has, as stars AND as the number', () => {
    render(
      <TraderCard
        trader={makeUserRef({ id: 'seller-1', review_score: '4.70' })}
        offer={offer}
        currentUserId="me"
      />,
    )
    expect(screen.getByRole('img', { name: '4.7 out of 5' })).toBeInTheDocument()
    expect(screen.getByText('4.70')).toBeInTheDocument()
  })

  it('says a trader is UNRATED rather than scoring them zero', () => {
    render(
      <TraderCard
        trader={makeUserRef({ id: 'seller-1', review_score: null })}
        offer={offer}
        currentUserId="me"
      />,
    )
    expect(screen.getByText(TRADER_CARD_COPY.unrated)).toBeInTheDocument()
    expect(screen.getByText(TRADER_CARD_COPY.unratedNote)).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('invents no reputation statistic', () => {
    const { container } = render(
      <TraderCard trader={makeUserRef({ id: 'seller-1' })} offer={offer} currentUserId="me" />,
    )
    const text = container.textContent ?? ''
    for (const invented of ['trades settled', 'completion rate', 'replies within', 'trading since']) {
      expect(text).not.toContain(invented)
    }
  })

  it('offers the profile and a message in THIS escrow’s context', () => {
    render(
      <TraderCard trader={makeUserRef({ id: 'seller-1' })} offer={offer} currentUserId="me" />,
    )
    expect(screen.getByRole('link', { name: /View .* profile/ })).toHaveAttribute(
      'href',
      '/profile/seller-1',
    )
    const message = screen.getByRole('link', { name: /^Message / })
    expect(message.getAttribute('href')).toContain('/chat/seller-1?escrowId=exch-1')
    expect(message.getAttribute('href')).toContain('kind=exchange')
  })

  it('counts the reviews left on THIS trade, worded for one and for many', () => {
    const { rerender } = render(
      <TraderCard trader={makeUserRef({ id: 'seller-1' })} offer={offer} currentUserId="me" />,
    )
    expect(screen.getByText('reviews on this trade')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()

    rerender(
      <TraderCard
        trader={makeUserRef({ id: 'seller-1' })}
        offer={makeExchangeDetail({
          reviews: [
            {
              id: 'rev-1',
              escrow_id: 'exch-1',
              reviewer_id: 'buyer-1',
              reviewee_id: 'seller-1',
              score: 5,
              comment: null,
              created_at: '2026-08-15T10:00:00.000Z',
            },
          ],
        })}
        currentUserId="me"
      />,
    )
    expect(screen.getByText('review on this trade')).toBeInTheDocument()
  })

  it('marks a Seeker trader, and nobody else', () => {
    const { rerender } = render(
      <TraderCard
        trader={makeUserRef({ id: 'seller-1', is_seeker: true })}
        offer={offer}
        currentUserId="me"
      />,
    )
    expect(screen.getByText(TRADER_CARD_COPY.seeker)).toBeInTheDocument()

    rerender(
      <TraderCard
        trader={makeUserRef({ id: 'seller-1', is_seeker: false })}
        offer={offer}
        currentUserId="me"
      />,
    )
    expect(screen.queryByText(TRADER_CARD_COPY.seeker)).toBeNull()
  })

  it('offers no way to message YOURSELF', () => {
    render(
      <TraderCard trader={makeUserRef({ id: 'me' })} offer={offer} currentUserId="me" />,
    )
    expect(screen.queryByRole('link', { name: /^Message / })).toBeNull()
    expect(screen.getByText(TRADER_CARD_COPY.you)).toBeInTheDocument()
  })
})

describe('TraderCard — whose card is it', () => {
  const offer = makeExchangeDetail()

  it('does not call the reader "the person on the other side" of their own offer', () => {
    // The card renders the escrow's CREATOR. For the seller that is themselves,
    // and it already says "You" — under a heading claiming it is someone else.
    render(
      <TraderCard trader={makeUserRef({ id: 'me' })} offer={offer} currentUserId="me" />,
    )
    expect(screen.getByRole('heading', { name: TRADER_CARD_COPY.selfHeading })).toBeInTheDocument()
    expect(screen.queryByText(OFFER_DETAIL_COPY.trader)).toBeNull()
  })

  it('still names the counterparty that way for everyone else', () => {
    render(
      <TraderCard trader={makeUserRef({ id: 'seller-1' })} offer={offer} currentUserId="me" />,
    )
    expect(screen.getByRole('heading', { name: OFFER_DETAIL_COPY.trader })).toBeInTheDocument()
  })
})

describe('TraderCard — a trader with no printable name', () => {
  it('falls back to a neutral noun rather than an empty heading', () => {
    // Same fallback `OfferCard` is tested for. A blank name here would leave
    // the profile link and the message link with no accessible name at all.
    render(
      <TraderCard
        trader={makeUserRef({ id: 'seller-1', first_name: '', last_name: '' })}
        offer={makeExchangeDetail()}
        currentUserId="me"
      />,
    )
    expect(screen.getAllByText(TRADER_CARD_COPY.anonymous).length).toBeGreaterThan(0)
    expect(
      screen.getByRole('link', { name: TRADER_CARD_COPY.message(TRADER_CARD_COPY.anonymous) }),
    ).toBeInTheDocument()
  })
})
