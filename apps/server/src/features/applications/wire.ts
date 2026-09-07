/**
 * Application row → wire shape.
 *
 * One mapper, because three surfaces return this object (the applicant's own
 * list, the poster's shortlist, and the response to applying) and a second
 * hand-rolled copy is how `expires_at` ends up an ISO string on one and a Date
 * on another.
 */

import type { GigApplicant, GigApplication } from '@tenda/shared'
import type { ApplicantRow, ApplicationRow } from '@server/features/applications/store'

export function toApplicationWire(row: ApplicationRow): GigApplication {
  return {
    id: row.id,
    escrow_id: row.escrow_id,
    applicant_id: row.applicant_id,
    message: row.message,
    status: row.status,
    expires_at: row.expires_at.toISOString(),
    created_at: row.created_at.toISOString(),
  }
}

/** The poster's shortlist adds who sent it. */
export function toApplicantWire(row: ApplicantRow): GigApplicant {
  return {
    ...toApplicationWire(row),
    first_name: row.first_name,
    last_name: row.last_name,
    avatar_url: row.avatar_url,
    review_score: row.review_score,
  }
}
