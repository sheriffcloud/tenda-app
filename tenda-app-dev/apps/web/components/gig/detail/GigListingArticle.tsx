/**
 * The LISTING half of a gig detail — header, brief, terms, required proof,
 * poster, reviews — extracted (2026-08-24, spec-correction #48) from the two
 * surfaces that were each composing it by hand: the public /gig/[id] page and
 * the workspace's /gigs/[id] pane. One composition, so the section set
 * and its order (terms BEFORE the poster — the reader is deciding on the
 * agreement, not the person) cannot drift between them.
 *
 * Listing fields only, no 'use client': the public page renders this in the
 * anonymous SSR pass, where party-scoped content must not exist to leak.
 */
import type { GigDetail } from '@tenda/shared'
import { GigBrief } from './GigBrief'
import { GigDetailHeader } from './GigDetailHeader'
import { GigDetailSection } from './GigDetailSection'
import { GigPosterCard } from './GigPosterCard'
import { GigProofList } from './GigProofList'
import { GigReviews } from './GigReviews'
import { GigTerms } from './GigTerms'
import { GIG_DETAIL_COPY } from './copy'

export function GigListingArticle({
  gig,
  revealParties = false,
}: {
  gig: GigDetail
  /** Passed through to the reviews: true only on AUTHED surfaces, where the
   *  bearer refetch may carry the counterparty to attribute a review to. */
  revealParties?: boolean
}) {
  return (
    <article>
      <GigDetailHeader gig={gig} />

      <GigDetailSection title={GIG_DETAIL_COPY.brief}>
        <GigBrief description={gig.description} />
      </GigDetailSection>

      <GigDetailSection title={GIG_DETAIL_COPY.terms}>
        <GigTerms gig={gig} />
      </GigDetailSection>

      <GigDetailSection title={GIG_DETAIL_COPY.proof}>
        <GigProofList requirements={gig.proof_requirements} params={gig.proof_params} />
      </GigDetailSection>

      <GigDetailSection title={GIG_DETAIL_COPY.postedBy}>
        <GigPosterCard creator={gig.creator} />
      </GigDetailSection>

      <GigReviews gig={gig} revealParties={revealParties} />
    </article>
  )
}
