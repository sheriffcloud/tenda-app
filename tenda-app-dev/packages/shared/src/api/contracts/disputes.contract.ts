/**
 * Party-facing dispute surface. Distinct from the admin triage queue
 * (/v1/admin/disputes): this lists the CALLER's own disputes so they remain
 * findable after a push notification is dismissed. Read-only; the thread and
 * transitions live under /v1/escrows/:id/*.
 */
import type { Endpoint } from '../endpoint'
import type { MyDisputeRow, MyDisputesQuery } from '../../types/dispute'
import type { PaginatedResponse } from '../../types/api'

export interface DisputesContract {
  /** GET /v1/disputes — the caller's disputes (open + resolved), paginated. */
  mine: Endpoint<'GET', undefined, undefined, MyDisputesQuery, PaginatedResponse<MyDisputeRow>>
}
