/**
 * Who is paying (comp lines 639-655).
 *
 * Reputation is public by design — the reviews a person has collected are
 * part of what makes an escrow worth taking — but a name and an average is
 * all this page shows. The note under the card says where the rest lives
 * rather than teasing a locked panel.
 *
 * `review_score` is a numeric(3,2) STRING on the wire and NULLABLE: null is
 * "nobody has reviewed them", which is a different statement from a low score
 * and is worded as one. The comp also carries a `creatorMeta` line (gigs
 * posted, member since); nothing on this wire supplies it, and inventing a
 * plausible sentence under someone's name is the one thing this card must not
 * do. Spec-correction #13.
 */
import { AGENT_BADGE_LABEL, displayName, formatReviewScore, type UserRef } from '@tenda/shared'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { GIG_DETAIL_COPY } from './copy'

export function GigPosterCard({ creator }: { creator: UserRef }) {
  const name = displayName(creator.first_name, creator.last_name, creator.id)
  const rating = formatReviewScore(creator.review_score)

  return (
    <>
      {/* The poster card is the other receipt-style object on the page and
          keeps its shadow (#60); everything around it is ruled. */}
      <div className="flex max-w-[60ch] items-center gap-4 rounded-card border border-border-subtle bg-surface-card px-5 py-[18px] shadow-card">
        <Avatar size="lg" name={name} src={creator.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-semibold leading-[26px] text-content-primary">{name}</p>
          {creator.is_agent && <Badge variant="brand" label={AGENT_BADGE_LABEL} />}
        </div>
        <div className="shrink-0 text-right">
          {rating === null ? (
            <p className="type-body-small text-content-tertiary">
              {GIG_DETAIL_COPY.noRating}
            </p>
          ) : (
            <>
              <p className="type-mono-mid text-content-primary">
                {rating}
              </p>
              <p className="type-caption text-content-tertiary">
                {GIG_DETAIL_COPY.ratingCaption}
              </p>
            </>
          )}
        </div>
      </div>
      <p className="mt-3 max-w-[60ch] type-body-small text-content-tertiary">
        {GIG_DETAIL_COPY.postedByNote}
      </p>
    </>
  )
}
