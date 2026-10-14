import type { GigDetail, Review, UserRef } from '@tenda/shared'
import { ReviewCard } from '@/components/profile'
import { GigDetailSection } from './GigDetailSection'

function reviewerFor(review: Review, gig: GigDetail, revealParties: boolean): UserRef | undefined {
  if (review.reviewer_id === gig.creator.id) return gig.creator
  if (revealParties && review.reviewer_id === gig.counterparty?.id) return gig.counterparty
  return undefined
}

export function GigReviews({ gig, revealParties = false }: { gig: GigDetail; revealParties?: boolean }) {
  if (gig.reviews.length === 0) return null

  return (
    <GigDetailSection title={`Reviews (${gig.reviews.length})`}>
      {/* Ruled rows straight under the section title (#60): the ReviewCard
          rules itself, so a card around the run would draw a box in a box. */}
      <div>
        {gig.reviews.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            reviewer={reviewerFor(review, gig, revealParties)}
            label={review.reviewee_id === gig.creator.id ? 'About the poster' : 'About the worker'}
          />
        ))}
      </div>
    </GigDetailSection>
  )
}
