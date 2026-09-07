/**
 * Notification-centre configuration — single source for the in-app feed,
 * broadcast targeting, and the retention sweep. No literal page sizes or
 * retention windows live at the call sites (server routes / worker / mobile
 * store all read from here).
 */

/** Default page size for the personal notification feed (cursor-paginated). */
export const NOTIFICATION_PAGE_SIZE = 20

/**
 * Column caps for a persisted notification. Single source for the schema
 * varchar lengths AND the delivery worker's defensive truncation, so a
 * composed body (e.g. a 200-char gig title) can never overflow the column
 * and 5xx the insert — the recurring untrusted-input→overflow guard.
 */
export const NOTIFICATION_TITLE_MAX = 200
export const NOTIFICATION_BODY_MAX = 500

/**
 * Deep-link vocabulary for a notification's `data.screen` field — the single
 * source shared by the server-side push-data builders (lib/notify), the mobile
 * route resolver, and the admin dashboard's resolver. Previously each producer
 * hand-wrote the literal, so the server could emit a screen no client routed
 * and nothing failed.
 *
 * Only the VOCABULARY is shared, never the routing table: the same screen
 * resolves to different destinations per surface (mobile opens a dispute by
 * escrow id, the dashboard by dispute id), so each client keeps its own map.
 */
export const NOTIFICATION_SCREEN = {
  escrow: 'escrow',
  dispute: 'dispute',
  chat: 'chat',
  fiatIntent: 'fiat-intent',
} as const

export type NotificationScreen = (typeof NOTIFICATION_SCREEN)[keyof typeof NOTIFICATION_SCREEN]

/** Retention sweep: read notifications older than this are pruned. */
export const NOTIFICATION_RETENTION_READ_DAYS = 60

/** Retention sweep: any notification older than this is pruned, read or not. */
export const NOTIFICATION_RETENTION_MAX_DAYS = 180

/**
 * Default lifetime for an announcement created from an admin push broadcast,
 * so push-originated notices self-expire instead of accumulating in the feed.
 */
export const PUSH_ANNOUNCEMENT_TTL_DAYS = 30

/**
 * Announcement audience kinds. A NULL `target` column means everyone (the
 * old 'all' value is collapsed into NULL). Non-null targets require a
 * matching `target_value` (role name, country code, or city name).
 * Single source for the schema column type, the contract, and the admin
 * route validation.
 */
export const ANNOUNCEMENT_TARGETS = ['role', 'country', 'city'] as const
export type AnnouncementTarget = (typeof ANNOUNCEMENT_TARGETS)[number]
