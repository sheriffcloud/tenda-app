/**
 * One review row — web twin of mobile's ReviewCard, tolerant of an
 * ANONYMOUS reviewer: the profile list endpoint serves bare review rows
 * (no reviewer identity), while escrow-detail call sites can supply one.
 *
 * Laid out as the #60 preview's review row: avatar, then the name with the
 * "about" label as a neutral badge and the score as a mono figure beside it,
 * the comment beneath, the time on the right. The score is one figure with
 * a sayable label rather than five glyphs — the row is scanned, and the
 * number is what a reader compares.
 */
import { formatFullName, type Review } from '@tenda/shared'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { RelativeTime } from '@/components/ui/RelativeTime'

export const REVIEW_CARD_COPY = {
  anonymous: 'Anonymous',
  counterparty: 'Counterparty',
  /** The accessible name of the score — "4 of 5 stars". */
  score: (score: number) => `${score} of 5 stars`,
} as const

export function ReviewCard({
  review,
  reviewer,
  label,
}: {
  review: Review
  reviewer?: { first_name: string | null; last_name: string | null; avatar_url: string | null }
  label?: string
}) {
  const name = reviewer
    ? formatFullName(reviewer.first_name, reviewer.last_name) || REVIEW_CARD_COPY.anonymous
    : REVIEW_CARD_COPY.counterparty

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-border-subtle py-3">
      <Avatar size="sm" name={name} src={reviewer?.avatar_url ?? null} />
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold leading-5 text-content-primary">
          <span className="min-w-0 truncate">{name}</span>
          {label !== undefined && <Badge variant="neutral" label={label} />}
          <span
            className="font-numeric text-xs font-medium leading-4 text-content-tertiary"
            aria-label={REVIEW_CARD_COPY.score(review.score)}
          >
            ★ {review.score.toFixed(1)}
          </span>
        </p>
        {review.comment !== null && review.comment !== '' && (
          <p className="mt-0.5 text-xs leading-4 text-content-tertiary">{review.comment}</p>
        )}
      </div>
      {/* `created_at` is non-nullable on the wire, so the guard is only
          against an empty string — which `RelativeTime` would render as
          "Invalid Date". */}
      {review.created_at !== '' && (
        <RelativeTime
          iso={review.created_at}
          className="shrink-0 font-numeric text-xs leading-4 text-content-tertiary"
        />
      )}
    </div>
  )
}
