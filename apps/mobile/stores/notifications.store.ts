/**
 * Notification-centre store — the in-app feed behind the bell (Stage 5).
 *
 * `unread` is the badge's single source of truth: server-authoritative on every
 * fetch (`unread_count`), bumped live when a `NotificationFrame` arrives on the
 * `user:<id>` WS channel (see realtime.store), and decremented optimistically on
 * mark-read. Personal notices are cursor-paginated; announcements are the
 * server's already-targeted, unpaginated set (pinned above the list).
 */

import { create } from 'zustand'
import { NOTIFICATION_PAGE_SIZE } from '@tenda/shared'
import type { NotificationWire, AnnouncementWire } from '@tenda/shared'
import { api } from '@/api/client'

interface NotificationsState {
  notifications: NotificationWire[]
  announcements: AnnouncementWire[]
  unread: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean

  /** Load (or reload) the first page + announcements + unread count. */
  fetchFeed: () => Promise<void>
  /** Append the next older page of personal notices (cursor = oldest loaded). */
  fetchMore: () => Promise<void>
  /** Lightweight badge refresh (no list load) — mount / reconnect / foreground. */
  refreshUnread: () => Promise<void>
  /** WS delivery of a new personal notice: prepend + bump the badge (deduped). */
  receive: (n: NotificationWire) => void
  /** Optimistically mark one notice read, then persist. */
  markRead: (id: string) => Promise<void>
  /** Optimistically clear the badge (notices + announcement cursor), then persist. */
  markAllRead: () => Promise<void>
  /** Drop all state on logout, so the next account never sees these notices. */
  reset: () => void
}

const INITIAL = {
  notifications: [] as NotificationWire[],
  announcements: [] as AnnouncementWire[],
  unread: 0,
  loading: false,
  loadingMore: false,
  hasMore: false,
}

/** Oldest loaded notice = the pagination cursor (feed is newest-first). */
function oldestId(list: NotificationWire[]): string | null {
  return list.length > 0 ? list[list.length - 1].id : null
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  ...INITIAL,

  fetchFeed: async () => {
    set({ loading: true })
    try {
      const feed = await api.notifications.feed()
      set({
        notifications: feed.notifications,
        announcements: feed.announcements,
        unread: feed.unread_count,
        hasMore: feed.notifications.length >= NOTIFICATION_PAGE_SIZE,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  fetchMore: async () => {
    const { notifications, hasMore, loadingMore, loading } = get()
    const cursor = oldestId(notifications)
    if (cursor === null || !hasMore || loadingMore || loading) return
    set({ loadingMore: true })
    try {
      const feed = await api.notifications.feed({ before_id: cursor })
      set((s) => {
        // Dedupe on append: a concurrent refresh (or WS receive) can reshape the
        // list mid-flight, so drop any id already present rather than risk a
        // duplicate FlatList key.
        const seen = new Set(s.notifications.map((n) => n.id))
        const fresh = feed.notifications.filter((n) => !seen.has(n.id))
        return {
          notifications: [...s.notifications, ...fresh],
          hasMore: feed.notifications.length >= NOTIFICATION_PAGE_SIZE,
          loadingMore: false,
        }
      })
    } catch {
      set({ loadingMore: false })
    }
  },

  refreshUnread: async () => {
    try {
      const { count } = await api.notifications.unreadCount()
      set({ unread: count })
    } catch {
      // Badge keeps its last value; the next fetch/frame reconciles.
    }
  },

  receive: (n) => {
    set((s) => {
      if (s.notifications.some((x) => x.id === n.id)) return s // dedupe vs a fetch race
      return {
        notifications: [n, ...s.notifications],
        unread: s.unread + (n.read_at === null ? 1 : 0),
      }
    })
  },

  markRead: async (id) => {
    const target = get().notifications.find((x) => x.id === id)
    if (target === undefined || target.read_at !== null) return // absent or already read
    set((s) => ({
      notifications: s.notifications.map((x) =>
        x.id === id ? { ...x, read_at: new Date().toISOString() } : x,
      ),
      unread: Math.max(0, s.unread - 1),
    }))
    try {
      await api.notifications.markRead({ id })
    } catch {
      // Low-stakes; the next fetchFeed reconciles read state from the server.
    }
  },

  markAllRead: async () => {
    set((s) => ({
      notifications: s.notifications.map((x) =>
        x.read_at === null ? { ...x, read_at: new Date().toISOString() } : x,
      ),
      unread: 0,
    }))
    try {
      await api.notifications.markAllRead()
    } catch {
      // Reconciles on next fetchFeed.
    }
  },

  reset: () => set({ ...INITIAL }),
}))
