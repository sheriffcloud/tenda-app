/**
 * Notification-centre store — verbatim web port of
 * apps/mobile/stores/notifications.store.ts (the in-app feed behind the
 * bell, Stage 5).
 *
 * `unread` is the badge's single source of truth: server-authoritative on every
 * fetch (`unread_count`), bumped live when a `NotificationFrame` arrives on the
 * `user:<id>` WS channel (see realtime.store), and decremented optimistically on
 * mark-read. Personal notices are cursor-paginated; announcements are the
 * server's already-targeted, unpaginated set of UNREAD broadcasts (pinned
 * above the list, and cleared wholesale by mark-all-read).
 */

import { create } from 'zustand'
import { accountGeneration, isSameAccount, registerAccountReset } from '@/lib/account-state'
import { NOTIFICATION_PAGE_SIZE } from '@tenda/shared'
import type { NotificationWire, AnnouncementWire } from '@tenda/shared'
import { api } from '@/api/client'
import type { InboxStatus } from '@/stores/chat.store'

interface NotificationsState {
  notifications: NotificationWire[]
  announcements: AnnouncementWire[]
  unread: number
  /**
   * A full-feed request is IN FLIGHT. Deliberately NOT the same question as
   * "should the surface show a skeleton" — that is `feedStatus`, which a
   * settled feed keeps through a background refresh. This one must stay honest
   * whenever a request is running, because `fetchMore` uses it for mutual
   * exclusion: a concurrent fetchFeed replaces the list wholesale while
   * fetchMore appends against the old cursor. Two names because they are two
   * questions; one name is what let them diverge (#48).
   */
  isFetchingFeed: boolean
  loadingMore: boolean
  hasMore: boolean

  /** Load (or reload) the first page + announcements + unread count. */
  /**
   * Whether the feed has ever been read from the server.
   *
   * Without it a failed load is indistinguishable from an empty account: the
   * catch below swallowed the error, and the centre told the reader "Nothing
   * new" when the server simply could not be reached (#17 review).
   */
  feedStatus: InboxStatus
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
  feedStatus: 'idle' as InboxStatus,
  isFetchingFeed: false,
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
    // #45: this feed belongs to whoever is signed in NOW. See lib/account-state.
    const gen = accountGeneration()
    // The request is in flight either way; the STATUS only moves for a feed
    // that has not settled. The column raises its skeleton whenever the status
    // is 'loading' AND it holds no rows — a guard that protects a populated
    // feed and fails an EMPTY one, which is the commonest account. Same rule,
    // same shape as chat.store's inbox and chain-registry.store before it.
    set((s) =>
      s.feedStatus === 'ready'
        ? { isFetchingFeed: true }
        : { isFetchingFeed: true, feedStatus: 'loading' },
    )
    try {
      const feed = await api.notifications.feed()
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
      // Still swallowed — every caller here is a badge refresh that must not
      // reject — but recorded, so the surface can say which it was. Not for a
      // dead session, though: that error belongs to nobody on screen.
      if (!isSameAccount(gen)) return
      // Only when nothing has settled yet. Without this a single failed
      // background refresh replaced a correct "nothing new" with "could not
      // load" — the feed had rows' worth of truth, just not newer truth.
      set((s) =>
        s.feedStatus === 'ready'
          ? { isFetchingFeed: false }
          : { isFetchingFeed: false, feedStatus: 'error' },
      )
    }
  },

  fetchMore: async () => {
    const { notifications, hasMore, loadingMore, isFetchingFeed } = get()
    const cursor = oldestId(notifications)
    if (cursor === null || !hasMore || loadingMore || isFetchingFeed) return
    const gen = accountGeneration()
    set({ loadingMore: true })
    try {
      const feed = await api.notifications.feed({ before_id: cursor })
      if (!isSameAccount(gen)) return
      set((s) => {
        // Dedupe on append: a concurrent refresh (or WS receive) can reshape the
        // list mid-flight, so drop any id already present rather than risk a
        // duplicate React key.
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
    const gen = accountGeneration()
    try {
      const { count } = await api.notifications.unreadCount()
      // The bell badge is the most visible of these: a stale count is the
      // previous account's unread total sitting on the next account's chrome.
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

/**
 * ACCOUNT-SCOPED: the feed and the unread badge, which outlive their screen on
 * purpose and so must be dropped explicitly. Registered beside the state
 * rather than called from `logout` — see lib/account-state.ts.
 */
registerAccountReset(() => useNotificationsStore.getState().reset())
