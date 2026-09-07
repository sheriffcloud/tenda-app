/**
 * Gig browse surfaces (escrows ⨝ details server-side), the create-detail
 * satellite (create flow step 2 — step 1 is `escrows.create`), and the
 * approval-mode application endpoints that hang off a gig.
 */
import {
  apiRoutes,
  type ApplyToGigBody,
  type CreateGigDetailsBody,
  type GigApplicant,
  type GigApplicantsQuery,
  type GigApplication,
  type GigDetail,
  type GigDetailsRow,
  type GigListQuery,
  type GigSummary,
  type MyApplication,
  type MyApplicationsQuery,
  type PaginatedResponse,
} from '@tenda/shared'
import { request } from '../request'
import { MODERATION_TIMEOUT_MS } from './timeouts'

const { gigs, applications } = apiRoutes

export const gigsApi = {
  featured: () => request<{ data: GigSummary[] }>('GET', gigs.featured),
  list: (query?: GigListQuery) =>
    request<PaginatedResponse<GigSummary>>('GET', gigs.list, { query }),
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

export const applicationsApi = {
  /**
   * The caller's OWN applications across every gig, newest first. Caller-scoped
   * like /v1/conversations: identity comes from the JWT, not the path.
   */
  mine: (query?: MyApplicationsQuery) =>
    request<PaginatedResponse<MyApplication>>('GET', applications.mine, { query }),
}
