import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GigReviews } from '@/components/gig/detail/GigReviews'
import { deliveryGigDetail } from '@/e2e/fixtures/gigs'

const review = {
  id: 'review-1',
  escrow_id: deliveryGigDetail.escrow_id,
  reviewer_id: deliveryGigDetail.creator.id,
  reviewee_id: 'worker-1',
  score: 5,
  comment: 'Excellent work.',
  created_at: '2026-08-01T09:00:00Z',
}

describe('GigReviews', () => {
  it('renders escrow reviews with party context', () => {
    render(<GigReviews gig={{ ...deliveryGigDetail, reviews: [review] }} />)
    expect(screen.getByRole('heading', { name: 'Reviews (1)' })).toBeInTheDocument()
    expect(screen.getByText('Excellent work.')).toBeInTheDocument()
    expect(screen.getByText('About the worker')).toBeInTheDocument()
  })

  it('renders nothing when the escrow has no reviews', () => {
    const { container } = render(<GigReviews gig={{ ...deliveryGigDetail, reviews: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does not expose a counterparty identity on a public detail', () => {
    const counterparty = { id: 'worker-1', first_name: 'Private', last_name: 'Worker', avatar_url: null, review_score: null, country: null, is_seeker: false, is_agent: false }
    render(<GigReviews gig={{ ...deliveryGigDetail, counterparty, reviews: [{ ...review, reviewer_id: counterparty.id }] }} />)
    expect(screen.queryByText('Private Worker')).not.toBeInTheDocument()
    expect(screen.getByText('Counterparty')).toBeInTheDocument()
  })
})
