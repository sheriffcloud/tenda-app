/**
 * The WORKER side: write the row, and only then broadcast the live frame.
 *
 * Separate from the producers because it runs in a different process at a
 * different time — they enqueue, this drains — and because it is the only half
 * that touches the database.
 */

import type { InferSelectModel } from 'drizzle-orm'
import { notifications } from '@tenda/shared/db/schema'
import { NOTIFICATION_TITLE_MAX, NOTIFICATION_BODY_MAX } from '@tenda/shared'
import type { NotificationWire } from '@tenda/shared'
import { channelName } from '@server/lib/ws'
import type { RealtimePublisher } from '@server/realtime'
import type { JobPayload } from '@server/plugins/queue'
import type { AppDatabase } from '@server/plugins/db'

type NotificationRow = InferSelectModel<typeof notifications>

/** DB row → wire shape. Shared by the WS frame here and the REST feed (read API). */
export function toNotificationWire(row: NotificationRow): NotificationWire {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    data: row.data ?? null,
    read_at: row.read_at?.toISOString() ?? null,
    created_at: row.created_at?.toISOString() ?? null,
  }
}

export interface PersistDeps {
  db: AppDatabase
  realtime: RealtimePublisher
}

/**
 * Outcome of a persist attempt. `'duplicate'` is not a failure: it is what a
 * retried job looks like, and the caller uses it to skip the work that was
 * already done rather than repeat it.
 */
export type PersistOutcome = 'inserted' | 'duplicate'

/**
 * Persist a notification and, only when a NEW row is written, broadcast a live
 * NotificationFrame on the recipient's `user:<id>` channel. onConflictDoNothing
 * returns [] on a retry duplicate → no second row, no second badge. Title/body
 * are clamped to the column caps so a composed body can never overflow the
 * column and 5xx the insert.
 *
 * REPORTS which happened, because the row is the only durable record that this
 * notification was already delivered once, and the PUSH needs that answer too —
 * see the note at the deliverNotification call site.
 */
export async function persistNotification(
  deps: PersistDeps,
  payload: JobPayload['notifications'],
): Promise<PersistOutcome> {
  const [row] = await deps.db
    .insert(notifications)
    .values({
      id: payload.id,
      user_id: payload.user_id,
      title: payload.title.slice(0, NOTIFICATION_TITLE_MAX),
      body: payload.body.slice(0, NOTIFICATION_BODY_MAX),
      ...(payload.data !== undefined ? { data: payload.data } : {}),
    })
    .onConflictDoNothing({ target: notifications.id })
    .returning()
  if (row === undefined) return 'duplicate' // retry — already delivered

  deps.realtime.publish({
    channel: channelName({ kind: 'user', id: payload.user_id }),
    type: 'notification',
    notification: toNotificationWire(row),
  })
  return 'inserted'
}
