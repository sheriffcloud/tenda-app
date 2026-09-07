/**
 * Application guards — the wiring between the pure rules and the database.
 *
 * Mirrors features/capacity/guards.ts: load config, count, decide, throw a
 * typed AppError. Nothing here makes a policy decision of its own.
 */

import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { getPlatformConfig } from '@server/lib/platform'
import {
  applicationCapacityMessage,
  checkApplicationCapacity,
  isAssignable,
  type ApplicationSnapshot,
} from '@server/features/applications/service'
import { drizzleApplicationStore } from '@server/features/applications/store'
import type { AppDatabase } from '@server/plugins/db'

/**
 * Refuses a new application once the worker already holds
 * `platform_config.max_open_applications` open ones.
 *
 * Spam control, not a consequence: the thing that makes applying cost
 * something is D2's strike rule, which attaches to being assigned and then
 * ghosting. This just stops one account blanketing every open gig.
 *
 * Skipped when the applicant already has an open row on THIS gig, because
 * re-applying upserts that row and therefore consumes no additional slot —
 * counting it would make editing your own pitch impossible at the cap.
 *
 * `existing` is passed in rather than looked up: the caller has to read the
 * row anyway (a first application and a re-application are different events),
 * and querying it twice invites the two reads to disagree under a concurrent
 * withdraw.
 */
export async function assertApplicationCapacity(
  db: AppDatabase,
  applicant_id: string,
  existing: ApplicationSnapshot | null,
): Promise<void> {
  if (existing !== null && existing.status === 'open') return

  const store = drizzleApplicationStore(db)
  const cfg = await getPlatformConfig(db)
  const open = await store.countOpen(applicant_id)
  const check = checkApplicationCapacity(open, cfg.max_open_applications)
  if (check.allowed) return

  throw new AppError(
    403,
    ErrorCode.APPLICATION_LIMIT_REACHED,
    applicationCapacityMessage(check),
    { open: check.open, limit: check.limit, remaining: check.remaining },
  )
}

/**
 * The application a poster is assigning from must still be live.
 *
 * A stale row is not merely untidy: assigning from one would stamp
 * `assigned_from_application`, making a worker who applied weeks ago liable
 * for an abandonment strike on a gig they have long forgotten.
 */
export function assertAssignable(
  application: ApplicationSnapshot | null,
  now: Date,
): asserts application is ApplicationSnapshot {
  if (application === null) {
    throw new AppError(
      404,
      ErrorCode.NOT_FOUND,
      'That worker has no application on this gig.',
    )
  }
  if (!isAssignable(application, now)) {
    throw new AppError(
      409,
      ErrorCode.APPLICATION_NOT_OPEN,
      application.status === 'open'
        ? 'That application has expired. Ask the worker to apply again.'
        : `That application is no longer open (${application.status}).`,
    )
  }
}
