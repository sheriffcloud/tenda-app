import type { Endpoint } from '../endpoint'
import type {
  RegisterDeviceTokenInput,
  NotificationFeed,
  NotificationsQuery,
} from '../../types'

export interface NotificationsContract {
  registerToken: Endpoint<'POST',   undefined,      RegisterDeviceTokenInput, undefined,          { ok: boolean }>
  /** Personal feed + active targeted announcements + unread count. */
  list:          Endpoint<'GET',    undefined,      undefined,                NotificationsQuery, NotificationFeed>
  /** Lightweight unread count for the bell badge. */
  unreadCount:   Endpoint<'GET',    undefined,      undefined,                undefined,          { count: number }>
  /** Mark one notification read (caller's own only). */
  markRead:      Endpoint<'POST',   { id: string }, undefined,                undefined,          { ok: boolean }>
  /** Mark all personal notifications read + advance the announcement cursor. */
  markAllRead:   Endpoint<'POST',   undefined,      undefined,                undefined,          { ok: boolean }>
}
