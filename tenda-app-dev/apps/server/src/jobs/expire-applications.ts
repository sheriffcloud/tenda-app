/**
 * expire-applications — sweeps gig applications past their `expires_at`.
 *
 * Deliberately a TIDIER, not a gate. `isAssignable` already refuses a lapsed
 * application the moment its deadline passes, whether or not this has run, so
 * a missed tick can never let a stale row be assigned. What the sweep buys is
 * an honest read surface: an applicant's list should say `expired`, not sit on
 * `open` forever, and a poster's shortlist should not show people whose window
 * has closed.
 *
 * Bounded per tick, like expire-escrows: a backlog drains across ticks instead
 * of one unbounded statement locking the table.
 */

import type { ApplicationStore } from '@server/features/applications/store'

/**
 * Rows per tick. Matched to expire-escrows' batch: large enough that a normal
 * day's expiries clear in one pass, small enough that a backlog cannot hold a
 * long transaction open.
 */
export const EXPIRE_APPLICATIONS_BATCH = 500

export interface ExpireApplicationsDeps {
  store: Pick<ApplicationStore, 'expireDue'>
  now(): Date
  log: { info(obj: Record<string, unknown>, msg: string): void }
}

export interface ExpireApplicationsResult {
  expired: number
}

export async function expireApplicationsHandler(
  deps: ExpireApplicationsDeps,
): Promise<ExpireApplicationsResult> {
  const expired = await deps.store.expireDue(deps.now(), EXPIRE_APPLICATIONS_BATCH)
  // Silent on a no-op tick: this runs every minute and an empty sweep is the
  // normal case, so logging it would bury everything else.
  if (expired > 0) {
    deps.log.info({ expired }, 'expire-applications: swept lapsed applications')
  }
  return { expired }
}
