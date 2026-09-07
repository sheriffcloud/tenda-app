/**
 * In-app notification-centre wire types. `NotificationWire` is one persisted
 * personal notice; `AnnouncementWire` is a broadcast (stored once, fanned out
 * on read); `NotificationFeed` is the merged payload the mobile screen renders
 * (announcements pinned above the cursor-paginated personal list).
 */

export interface NotificationWire {
  id: string
  title: string
  body: string
  /** Deep-link params ({ screen, escrowId, kind, ... }); null when non-routable. */
  data: Record<string, string> | null
  read_at: string | null
  created_at: string
}

export interface AnnouncementWire {
  id: string
  title: string
  body: string
  priority: number
  published_at: string | null
  expires_at: string | null
}

export interface NotificationFeed {
  notifications: NotificationWire[]
  announcements: AnnouncementWire[]
  unread_count: number
}

/** Cursor pagination for the personal feed (mirrors chat's MessagesQuery). */
export type NotificationsQuery = {
  before_id?: string
  limit?: number
}
