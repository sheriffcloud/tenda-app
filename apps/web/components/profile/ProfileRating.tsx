'use client'

/**
 * The rating line under a name (comp: stars · score · caption).
 *
 * The caption carries the denominator on purpose. `review_score` is a 0–5
 * average, and an average with no count behind it is the most flattering way
 * to state it — one five-star review and forty both render "5.0". A reader
 * deciding whether to trade with someone needs to know which they are looking
 * at, so the count is not optional decoration.
 */
import { RatingStars } from '@/components/ui/RatingStars'

/** How the count is worded — including the honest answer when there is none. */
export function ratingCaption(reviews: number): string {
  if (reviews === 0) return 'No reviews yet'
  return reviews === 1 ? 'from 1 review' : `from ${reviews} reviews`
}

/**
 * A score is only meaningful with a review behind it. A user with none has
 * `review_score` null, and rendering "0.0 ★" for them would read as forty
 * terrible reviews rather than none at all.
 */
export function ProfileRating({
  score,
  reviews,
  loaded,
}: {
  /** The 0–5 average from the wire, or null when the user has no reviews. */
  score: string | null
  reviews: number
  /** False until the counts settle, so the caption isn't asserted early. */
  loaded: boolean
}) {
  const value = score !== null && score !== '' ? Number(score) : null
  const hasRating = value !== null && Number.isFinite(value) && reviews > 0

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      {hasRating && <RatingStars score={value} size={15} />}
      {hasRating && (
        <span className="font-numeric text-sm font-bold text-content-primary">
          {value.toFixed(1)}
        </span>
      )}
      <span className="text-xs text-content-tertiary">
        {loaded ? ratingCaption(reviews) : '—'}
      </span>
    </div>
  )
}
