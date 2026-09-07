/**
 * Notification-centre store — the in-app feed behind the bell (Stage 5).
 *
 * `unread` is the badge's single source of truth: server-authoritative on every
 * fetch (`unread_count`), bumped live when a `NotificationFrame` arrives on the
 * `user:<id>` WS channel (see realtime.store), and decremented optimistically on
 * mark-read. Personal notices are cursor-paginated; announcements are the
 * server's already-targeted, unpaginated set of UNREAD broadcasts (pinned
 * above the list, and cleared wholesale by mark-all-read).
 */

import { create } from 'zustand'
import { NOTIFICATION_PAGE_SIZE, accountGeneration, isSameAccount, registerAccountReset } from '@tenda/shared'
import type { NotificationWire, AnnouncementWire, LoadStatus } from '@tenda/shared'
import { api } from '@/api/client'

interface NotificationsState {
  notifications: NotificationWire[]
  announcements: AnnouncementWire[]
  unread: number
  /**
   * A full-feed request is IN FLIGHT. Deliberately NOT the same question as
   * "should the surface show a skeleton or withdraw its empty state" — that is
   * `feedStatus`, which a settled feed keeps through a background refresh. This
   * one must stay honest whenever a request is running, because `fetchMore`
   * uses it for mutual exclusion: a concurrent fetchFeed replaces the list
   * wholesale while fetchMore appends against the old cursor.
   *
   * It was called `loading` and the screen read it for display, which is how
   * the empty state came to blink (#57). Two names because they are two
   * questions; one name is what let them be confused.
   */
  isFetchingFeed: boolean
  /**
   * Whether the feed has ever been read from the server, in the SHARED
   * vocabulary (`LoadStatus`) rather than a fourth private copy of it — the
   * type exists because this exact union had already been written twice.
   */
  feedStatus: LoadStatus
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
  /** Optimistically clear the badge AND the pinned broadcasts (notices read +
   *  announcement cursor advanced), then persist. */
  markAllRead: () => Promise<void>
  /** Drop all state on logout, so the next account never sees these notices. */
  reset: () => void
}

const INITIAL = {
  notifications: [] as NotificationWire[],
  announcements: [] as AnnouncementWire[],
  unread: 0,
  isFetchingFeed: false,
  feedStatus: 'idle' as LoadStatus,
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
    const gen = accountGeneration()
    // The request is in flight either way; the STATUS only moves for a feed
    // that has not settled. The screen withdraws its empty state while the
    // status is 'loading', which is right for a first load and wrong for a
    // refresh — on an account that genuinely has no notifications, every
    // pull-to-refresh made "No notifications yet" disappear and come back (#57).
    set((s) =>
      s.feedStatus === 'ready'
        ? { isFetchingFeed: true }
        : { isFetchingFeed: true, feedStatus: 'loading' },
    )
    try {
      const feed = await api.notifications.feed()
      // Another account's notifications are as private as their messages.
      if (!isSameAccount(gen)) return
      set({
        notifications: feed.notifications,
        announcements: feed.announcements,
        unread: feed.unread_count,
        hasMore: feed.notifications.length >= NOTIFICATION_PAGE_SIZE,
        isFetchingFeed: false,
        feedStatus: 'ready',
      })
    } catch {
      // Guarded like the success path: `feedStatus: 'error'` is a retry banner,
      // and one raised by the previous account's failed load is a banner the
      // next account cannot explain or dismiss.
      if (!isSameAccount(gen)) return
      // Still swallowed — every caller here is fire-and-forget — but recorded,
      // so a surface that wants to tell a failed load from an empty account
      // can. Only when nothing has settled yet: a failed refresh must not
      // discard an answer the reader already has.
      set((s) =>
        s.feedStatus === 'ready'
          ? { isFetchingFeed: false }
          : { isFetchingFeed: false, feedStatus: 'error' },
      )
    }
  },

  fetchMore: async () => {
    const gen = accountGeneration()
    const { notifications, hasMore, loadingMore, isFetchingFeed } = get()
    const cursor = oldestId(notifications)
    if (cursor === null || !hasMore || loadingMore || isFetchingFeed) return
    set({ loadingMore: true })
    try {
      const feed = await api.notifications.feed({ before_id: cursor })
      if (!isSameAccount(gen)) return
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
      if (!isSameAccount(gen)) return
      set({ loadingMore: false })
    }
  },

  refreshUnread: async () => {
    const gen = accountGeneration()
    try {
      const { count } = await api.notifications.unreadCount()
      // The badge alone is enough to leak: a count belonging to the previous
      // account sits on the bell until the next successful fetch (#65).
      if (!isSameAccount(gen)) return
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
      // No generation guard, because there is no post-await WRITE to guard:
      // the optimistic `set` above already happened, and the catch only
      // comments. A guard on a method that writes nothing after its await
      // would be decoration.
    } catch {
      // Low-stakes; the next fetchFeed reconciles read state from the server.
    }
  },

  markAllRead: async () => {
    // Announcements go too, and not only for symmetry: the server now serves
    // the UNREAD broadcasts, so the next fetch drops them anyway. Without the
    // optimistic clear the reader taps "mark all read", watches the badge hit
    // zero, and the pinned cards sit there until something happens to refetch.
    set((s) => ({
      notifications: s.notifications.map((x) =>
        x.read_at === null ? { ...x, read_at: new Date().toISOString() } : x,
      ),
      announcements: [],
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

// The bell's rows and its unread badge, both account-scoped. `logout` used to
// call this store's reset by name — the one store anybody remembered — which
// is exactly the pattern that left chat and gigs behind (#65).
registerAccountReset(() => useNotificationsStore.getState().reset())
