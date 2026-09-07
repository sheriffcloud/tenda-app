/**
 * Gig browse surface — read-only. Gigs are escrows (kind='gig'); creation
 * and transitions live in escrows.contract. These endpoints serve the
 * public feed from escrows ⨝ gig_details.
 */
import type { Endpoint } from '../endpoint'
import type {
  CreateGigDetailsBody,
  GigDetailsRow,
  GigSummary,
  GigDetail,
  GigFacets,
  GigFacetsQuery,
  GigListQuery,
  PaginatedResponse,
} from '../../types'
import type {
  ApplyToGigBody,
  GigApplicant,
  GigApplicantsQuery,
  GigApplication,
} from '../../types/application'

export interface GigsContract {
  list: Endpoint<'GET', undefined, undefined, GigListQuery, PaginatedResponse<GigSummary>>
  /**
   * Counts for the feed rail's cells, all of them in one request. Shares the
   * feed's base conditions server-side, so a rail number can never disagree
   * with the list beside it.
   */
  facets: Endpoint<'GET', undefined, undefined, GigFacetsQuery, GigFacets>
  /** CO8 curated rail — home-top carousel; separately cached server-side. */
  featured: Endpoint<'GET', undefined, undefined, undefined, { data: GigSummary[] }>
  /** Attach the listing satellite to a draft escrow (create flow step 2). */
  create: Endpoint<'POST', undefined, CreateGigDetailsBody, undefined, GigDetailsRow>
  get: Endpoint<'GET', { id: string }, undefined, undefined, GigDetail>
  /** Poster's shortlist for one gig. Creator-only. */
  applicants: Endpoint<'GET', { id: string }, undefined, GigApplicantsQuery, { data: GigApplicant[] }>
  /** Worker raises their hand. Re-applying upserts the same row. */
  apply: Endpoint<'POST', { id: string }, ApplyToGigBody, undefined, GigApplication>
  /**
   * Worker withdraws. No application id in the path: a worker has at most ONE
   * application per gig (unique escrow+applicant), so identifying it by the
   * caller removes the only way to aim this at someone else's row.
   */
  withdrawApplication: Endpoint<'DELETE', { id: string }, undefined, undefined, { withdrawn: true }>
}
