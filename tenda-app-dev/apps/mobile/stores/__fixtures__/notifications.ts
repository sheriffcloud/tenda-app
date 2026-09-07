/**
 * Wire-shaped notification rows for the bell's suites.
 *
 * Extracted because there were two byte-similar copies — one in
 * `notifications.store.test.ts`, one in `notifications.store.settled.test.ts` —
 * and #65 needed a third. A builder written three times is a wire shape that
 * drifts three ways: the copies had already diverged, one taking a `read` flag
 * the other lacked.
 *
 * Overrides rather than positional arguments, so a case states only the field
 * it is about.
 */
import { NOTIFICATION_PAGE_SIZE } from '@tenda/shared'
import type { AnnouncementWire, NotificationFeed, NotificationWire } from '@tenda/shared'

const READ_AT = '2026-01-01T00:00:00.000Z'

export function notif(id: string, read = false): NotificationWire {
  return {
    id,
    title:      `t-${id}`,
    body:       'body',
    data:       null,
    read_at:    read ? READ_AT : null,
    created_at: READ_AT,
  }
}

export function feed(over: Partial<NotificationFeed> = {}): NotificationFeed {
  return { notifications: [], announcements: [], unread_count: 0, ...over }
}

/** Exactly one page, so `hasMore` flips — the boundary the pagination reads. */
export function fullPage(prefix = 'n'): NotificationWire[] {
  return Array.from({ length: NOTIFICATION_PAGE_SIZE }, (_, i) => notif(`${prefix}${i}`))
}

export type { AnnouncementWire }
