/**
 * Notification read model — the feed, unread count, and announcement targeting
 * shared by GET /v1/notifications and GET /v1/notifications/unread-count.
 *
 * Personal notices are cursor-paginated per user; broadcasts live once in
 * `announcements` and are filtered to the viewer at read time (fan-out-on-read)
 * — a NULL `target` means everyone, else target_value matches the viewer's
 * role / country / city. Unread announcements are those published after the
 * viewer's `announcements_read_at` cursor.
 */

import { and, or, eq, gt, lt, lte, isNull, desc, sql, type SQL } from 'drizzle-orm'
import { notifications, announcements, users } from '@tenda/shared/db/schema'
import { NOTIFICATION_PAGE_SIZE } from '@tenda/shared'
import type { NotificationFeed, AnnouncementWire, NotificationsQuery } from '@tenda/shared'
import { clampLimit } from '@server/lib/pagination'
import { isUuidLike } from '@server/lib/uuid'
import { toNotificationWire } from '@server/lib/notify'
import type { AppDatabase } from '@server/plugins/db'

export interface NotificationViewer {
  id: string
  role: string
  country: string | null
  city: string | null
  announcements_read_at: Date | null
}

/** Load the viewer context targeting needs (role is in the JWT; country/city are not). */
export async function loadViewer(db: AppDatabase, userId: string): Promise<NotificationViewer | null> {
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      country: users.country,
      city: users.city,
      announcements_read_at: users.announcements_read_at,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row ?? null
}

/** Announcements the viewer may see: active, unexpired, and targeted to them. */
function visibleAnnouncement(viewer: NotificationViewer, now: Date): SQL {
  const targets: SQL[] = [
    isNull(announcements.target), // NULL target = everyone
    and(eq(announcements.target, 'role'), eq(announcements.target_value, viewer.role))!,
  ]
  if (viewer.country !== null) {
    targets.push(and(eq(announcements.target, 'country'), eq(announcements.target_value, viewer.country))!)
  }
  if (viewer.city !== null) {
    targets.push(and(eq(announcements.target, 'city'), eq(announcements.target_value, viewer.city))!)
  }
  return and(
    eq(announcements.is_active, true),
    or(isNull(announcements.expires_at), gt(announcements.expires_at, now))!,
    or(...targets)!,
  )!
}

/** The timestamp an announcement became visible — its cursor comparison key
 *  (published_at once activated, else created_at). */
const announcementPublished = sql`coalesce(${announcements.published_at}, ${announcements.created_at})`

/** Announcements published strictly after the viewer's read cursor (still unread).
 *  The cursor is bound as an ISO string, NOT a raw Date: a Date in a `sql`
 *  template has no column mapper, so the postgres driver rejects it (whereas a
 *  drizzle column operator like `gt(col, date)` maps it for you). */
function publishedAfter(cursor: Date): SQL {
  return sql`${announcementPublished} > ${cursor.toISOString()}`
}

type AnnouncementRow = {
  id: string
  title: string
  body: string
  priority: number
  published_at: Date | null
  expires_at: Date | null
}

/** DB row → wire shape. Shared by the feed here and the public announcements route. */
export function toAnnouncementWire(row: AnnouncementRow): AnnouncementWire {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    published_at: row.published_at?.toISOString() ?? null,
    expires_at: row.expires_at?.toISOString() ?? null,
  }
}

/** Unread personal notifications + unread (post-cursor) announcements. */
export async function countUnread(db: AppDatabase, viewer: NotificationViewer, now: Date): Promise<number> {
  const annCond =
    viewer.announcements_read_at === null
      ? visibleAnnouncement(viewer, now)
      : and(visibleAnnouncement(viewer, now), publishedAfter(viewer.announcements_read_at))!

  const [personal, broadcast] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.user_id, viewer.id), isNull(notifications.read_at))),
    db.select({ c: sql<number>`count(*)::int` }).from(announcements).where(annCond),
  ])
  return personal[0].c + broadcast[0].c
}

/** Assemble the merged feed: cursor-paginated personal notices + targeted announcements + unread count. */
export async function loadFeed(
  db: AppDatabase,
  viewer: NotificationViewer,
  query: NotificationsQuery,
  now: Date,
): Promise<NotificationFeed> {
  const limit = clampLimit(Number(query.limit) || NOTIFICATION_PAGE_SIZE)

  // Resolve the cursor row's created_at — scoped to the viewer so another
  // user's id can never be used as a cursor (no cross-user leak). A malformed
  // before_id is ignored (→ first page) rather than 500ing on the uuid column.
  let cursorCreatedAt: Date | undefined
  if (query.before_id && isUuidLike(query.before_id)) {
    const [c] = await db
      .select({ created_at: notifications.created_at })
      .from(notifications)
      .where(and(eq(notifications.id, query.before_id), eq(notifications.user_id, viewer.id)))
      .limit(1)
    if (c?.created_at) cursorCreatedAt = c.created_at
  }

  // Compound cursor (created_at, id) — stable when a fan-out batch shares a timestamp.
  const cursorCond = cursorCreatedAt
    ? or(
        lt(notifications.created_at, cursorCreatedAt),
        and(lte(notifications.created_at, cursorCreatedAt), lt(notifications.id, query.before_id!)),
      )!
    : undefined

  const [notifRows, annRows, unread] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(cursorCond ? and(eq(notifications.user_id, viewer.id), cursorCond) : eq(notifications.user_id, viewer.id))
      .orderBy(desc(notifications.created_at), desc(notifications.id))
      .limit(limit),
    db
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        priority: announcements.priority,
        published_at: announcements.published_at,
        expires_at: announcements.expires_at,
      })
      .from(announcements)
      .where(visibleAnnouncement(viewer, now))
      .orderBy(desc(announcements.priority), sql`${announcementPublished} desc`)
      .limit(NOTIFICATION_PAGE_SIZE),
    countUnread(db, viewer, now),
  ])

  return {
    notifications: notifRows.map(toNotificationWire),
    announcements: annRows.map(toAnnouncementWire),
    unread_count: unread,
  }
}
