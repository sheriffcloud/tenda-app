/**
 * Gig browse surfaces (escrows ⨝ details server-side), the create-detail
 * satellite (create flow step 2 — step 1 is `escrows.create`), and the
 * approval-mode application endpoints that hang off a gig.
 */
import { apiRoutes } from '../routes'
import type {
  ApplyToGigBody,
  CreateGigDetailsBody,
  GigApplicant,
  GigApplicantsQuery,
  GigApplication,
  GigDetail,
  GigDetailsRow,
  GigFacets,
  GigFacetsQuery,
  GigListQuery,
  GigSummary,
  MyApplication,
  MyApplicationsQuery,
  PaginatedResponse,
} from '../..'
import type { ApiRequest } from './types'
import { MODERATION_TIMEOUT_MS } from './timeouts'

const { gigs, applications } = apiRoutes

export function createGigsApi(request: ApiRequest) {
  return {
    featured: () => request<{ data: GigSummary[] }>('GET', gigs.featured),
    list: (query?: GigListQuery) =>
      request<PaginatedResponse<GigSummary>>('GET', gigs.list, { query }),
    /**
     * Counts for the feed rail's cells. Web-only: mobile's filter sheet draws no
     * counts, and shipping an unused endpoint there would be dead weight.
     */
    facets: (query?: GigFacetsQuery) => request<GigFacets>('GET', gigs.facets, { query }),
    create: (body: CreateGigDetailsBody) =>
      request<GigDetailsRow>('POST', gigs.create, { body, timeout: MODERATION_TIMEOUT_MS }),
    get: (params: { id: string }) => request<GigDetail>('GET', gigs.get, { params }),

    /**
     * The poster's shortlist for their own gig. 403 for anybody else: knowing
     * who else applied is exactly what a rival applicant may not see.
     */
    applicants: (params: { id: string }, query?: GigApplicantsQuery) =>
      request<{ data: GigApplicant[] }>('GET', gigs.applicants, { params, query }),
    /** Raise your hand. Re-applying upserts the same row rather than stacking. */
    apply: (params: { id: string }, body?: ApplyToGigBody) =>
      request<GigApplication>('POST', gigs.apply, { params, body: body ?? {} }),
    /** Withdraw. No application id in the path — a worker has at most one per gig. */
    withdrawApplication: (params: { id: string }) =>
      request<{ withdrawn: true }>('DELETE', gigs.withdrawApplication, { params }),
  }
}

export function createApplicationsApi(request: ApiRequest) {
  return {
    /**
     * The caller's OWN applications across every gig, newest first. Caller-scoped
     * like /v1/conversations: identity comes from the JWT, not the path.
     */
    mine: (query?: MyApplicationsQuery) =>
      request<PaginatedResponse<MyApplication>>('GET', applications.mine, { query }),
  }
}
