/**
 * Gig applications on the wire.
 *
 * Three shapes because three readers need different things:
 *  - `GigApplication` — the row itself, what the applicant gets back on apply.
 *  - `GigApplicant`   — the poster's shortlist: the row plus who sent it.
 *  - `MyApplication`  — the applicant's list: the row plus the gig it is on,
 *    because "did I win?" is only answerable with both.
 */

import type { ApplicationStatus } from '../constants/applications'
import type { GigSummary } from './gig'

export interface GigApplication {
  id: string
  escrow_id: string
  applicant_id: string
  /** Optional pitch, trimmed; null when the applicant sent none. */
  message: string | null
  status: ApplicationStatus
  /** ISO-8601. After this the application is no longer assignable. */
  expires_at: string
  created_at: string
}

/** One row of the poster's shortlist. */
export interface GigApplicant extends GigApplication {
  first_name: string
  last_name: string
  avatar_url: string | null
  /** users.review_score — numeric(3,2) as a string, or null when unrated. */
  review_score: string | null
}

/** One row of the applicant's own list. */
export interface MyApplication {
  application: GigApplication
  /**
   * The gig applied to. Nested rather than flattened so the summary stays
   * byte-identical to every other gig surface (lib/gig-read's stated purpose)
   * and the client can reuse the same card component.
   */
  gig: GigSummary
}

/**
 * Query for the poster's shortlist.
 *
 * `status` is an ARRAY that serialises CSV (`?status=open,passed`), the same
 * contract `GigListQuery.status` uses — so the caller states which statuses it
 * wants in the shared vocabulary instead of hand-joining a string, and an
 * unknown one is a compile error rather than a 400.
 *
 * Omit it entirely to get the server's own live default; restating that set
 * client-side is how the two drift.
 */
export type GigApplicantsQuery = {
  status?: ApplicationStatus[]
}

/** Query for the caller's own applications. Offset-paginated like every list. */
export type MyApplicationsQuery = {
  limit?: number
  offset?: number
}

export interface ApplyToGigBody {
  /** Optional pitch; capped at APPLICATION_MESSAGE_MAX_LENGTH. */
  message?: string | null
}

/**
 * Everything about a gig that depends on WHO is asking — grouped rather than
 * flattened into `viewer_*` columns on the gig itself.
 *
 * One object because the "anonymous caller sees none of it" rule is then
 * expressed once, and because the two fields have different null meanings that
 * would be indistinguishable side by side on a flat shape (`application: null`
 * = "you have not applied"; `open_application_count: null` = "not your gig").
 *
 * Answering this server-side is not an optimisation. The client alternative —
 * matching the caller's own gig against GET /v1/applications — is WRONG:
 * that list is paginated over every status a worker has ever held, so the row
 * for this gig can sit beyond the first page and read as "never applied".
 */
export interface GigViewerContext {
  /**
   * The caller's own application on this gig, in whatever state — `null` when
   * they have never applied. Drives Apply vs Applied vs Withdraw, and the live
   * countdown to `expires_at`.
   */
  application: GigApplication | null
  /**
   * Applications still waiting on a decision. POSTER-ONLY: `null` for everyone
   * else, because the shortlist route already refuses to tell a rival how much
   * competition they have, and a bare count leaks the same thing more quietly.
   */
  open_application_count: number | null
}

/** Poster assigns a specific applicant; the tx is theirs to sign. */
export interface AssignWorkerBody {
  /** The applicant's user id — NOT their wallet; the adapter resolves that. */
  worker_user_id: string
}

/** Response to the assigned worker's off-chain "I'm not available". */
export interface ReleaseAssignmentResponse {
  /** ISO-8601 stamp recorded on the escrow. */
  released_at: string
}
