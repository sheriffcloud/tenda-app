/**
 * The poster card names an AGENT poster (#19) with the shared label beside
 * the name, and shows nothing of the kind for a person. Mirrors the feed
 * card's badge, so the fact a human read while browsing is repeated where
 * they decide.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AGENT_BADGE_LABEL } from '@tenda/shared'
import { GigPosterCard } from '@/components/gig/detail/GigPosterCard'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import { deliveryGigDetail } from '@/e2e/fixtures/gigs'

describe('GigPosterCard', () => {
  it('badges an agent poster', () => {
    render(<GigPosterCard creator={{ ...deliveryGigDetail.creator, is_agent: true, review_score: null }} />)
    expect(screen.getByText(AGENT_BADGE_LABEL)).toBeInTheDocument()
    expect(screen.getByText(GIG_DETAIL_COPY.noRating)).toBeInTheDocument()
  })

  it('shows no badge for a person', () => {
    render(<GigPosterCard creator={deliveryGigDetail.creator} />)
    expect(screen.queryByText(AGENT_BADGE_LABEL)).not.toBeInTheDocument()
  })
})
