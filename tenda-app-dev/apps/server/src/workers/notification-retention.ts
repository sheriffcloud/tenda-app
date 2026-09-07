/**
 * Notification retention sweep — the counterweight to the personal-notification
 * write path. Broadcasts stay bounded (one row each), but per-user notifications
 * grow unboundedly, so a daily job prunes them: read notices past
 * NOTIFICATION_RETENTION_READ_DAYS, and anything past NOTIFICATION_RETENTION_MAX_DAYS
 * regardless of read state. Announcements are left alone — they are bounded,
 * admin-authored, and already filtered by expiry on read.
 */

import { and, isNotNull, lt, or } from 'drizzle-orm'
import { notifications } from '@tenda/shared/db/schema'
import { NOTIFICATION_RETENTION_READ_DAYS, NOTIFICATION_RETENTION_MAX_DAYS } from '@tenda/shared'
import type { AppDatabase } from '@server/plugins/db'

const DAY_MS = 24 * 3_600_000

export interface RetentionDeps {
  db: AppDatabase
  log: { info(obj: object, msg: string): void }
  /** Injectable clock so the cutoffs are deterministic under test. */
  now: () => Date
}

/** Delete stale personal notifications; returns how many rows were pruned. */
export async function handleNotificationRetention(deps: RetentionDeps): Promise<{ pruned: number }> {
  const nowMs = deps.now().getTime()
  const readCutoff = new Date(nowMs - NOTIFICATION_RETENTION_READ_DAYS * DAY_MS)
  const maxCutoff = new Date(nowMs - NOTIFICATION_RETENTION_MAX_DAYS * DAY_MS)

  const deleted = await deps.db
    .delete(notifications)
    .where(
      or(
        and(isNotNull(notifications.read_at), lt(notifications.read_at, readCutoff)),
        lt(notifications.created_at, maxCutoff),
      ),
    )
    .returning({ id: notifications.id })

  deps.log.info({ pruned: deleted.length }, 'notification-retention: swept stale notifications')
  return { pruned: deleted.length }
}
