/**
 * Notification store behavior: server-authoritative badge on fetch, cursor
 * pagination with mid-flight dedupe, optimistic mark-read that reconciles
 * on failure, WS receive dedupe, and the logout reset.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTIFICATION_PAGE_SIZE } from '@tenda/shared'
import type { NotificationFeed, NotificationWire } from '@tenda/shared'

const notificationsApi = vi.hoisted(() => ({
  feed: vi.fn<(q?: { before_id: string }) => Promise<NotificationFeed>>(),
  unreadCount: vi.fn<() => Promise<{ count: number }>>(),
  markRead: vi.fn<(p: { id: string }) => Promise<{ ok: boolean }>>(),
  markAllRead: vi.fn<() => Promise<{ ok: boolean }>>(),
}))

vi.mock('@/api/client', () => ({ api: { notifications: notificationsApi } }))

import { useNotificationsStore } from '@/stores/notifications.store'

function notice(over: Partial<NotificationWire> & { id: string }): NotificationWire {
  return {
    title: 'Gig accepted',
    body: 'Bola accepted your gig',
    data: { screen: 'escrow', escrowId: 'e1', kind: 'gig' },
    read_at: null,
    created_at: '2026-08-15T10:00:00.000Z',
    ...over,
  }
}

function page(n: number, offset = 0): NotificationWire[] {
  return Array.from({ length: n }, (_, i) => notice({ id: `n-${offset + i}` }))
}

beforeEach(() => {
  vi.clearAllMocks()
  useNotificationsStore.getState().reset()
})

describe('a SETTLED feed keeps its answer through a refresh (#48)', () => {
  /** Settle the feed on a genuinely EMPTY account — the case both guards protect. */
  async function settleEmpty() {
    notificationsApi.feed.mockResolvedValue({ notifications: [], announcements: [], unread_count: 0 })
    await useNotificationsStore.getState().fetchFeed()
    expect(useNotificationsStore.getState().feedStatus).toBe('ready')
  }

  it('a refresh does not re-raise the skeleton over a settled EMPTY feed', async () => {
    // The column shows its skeleton when the status is 'loading' AND it holds
    // no rows — a guard that protects a populated feed and fails an empty one.
    // Before this, every refresh blinked a skeleton over a correct "nothing new".
    await settleEmpty()
    let statusDuringRefresh: string | null = null
    notificationsApi.feed.mockImplementation(async () => {
      statusDuringRefresh = useNotificationsStore.getState().feedStatus
      return { notifications: [], announcements: [], unread_count: 0 }
    })
    await useNotificationsStore.getState().fetchFeed()
    expect(statusDuringRefresh).toBe('ready')
  })

  it('a FAILED refresh does not replace a settled EMPTY feed with the error state', async () => {
    // "Could not load your notifications" over an account that simply has none
    // is a worse lie than saying nothing new arrived.
    await settleEmpty()
    notificationsApi.feed.mockRejectedValue(new Error('down'))
    await useNotificationsStore.getState().fetchFeed()
    expect(useNotificationsStore.getState().feedStatus).toBe('ready')
    expect(useNotificationsStore.getState().isFetchingFeed).toBe(false)
  })

  it('a FIRST load still raises the skeleton', async () => {
    let statusDuringLoad: string | null = null
    notificationsApi.feed.mockImplementation(async () => {
      statusDuringLoad = useNotificationsStore.getState().feedStatus
      return { notifications: [], announcements: [], unread_count: 0 }
    })
    await useNotificationsStore.getState().fetchFeed()
    expect(statusDuringLoad).toBe('loading')
  })

  it('a retry AFTER an error still raises the skeleton', async () => {
    notificationsApi.feed.mockRejectedValue(new Error('down'))
    await useNotificationsStore.getState().fetchFeed()
    expect(useNotificationsStore.getState().feedStatus).toBe('error')

    let statusDuringRetry: string | null = null
    notificationsApi.feed.mockImplementation(async () => {
      statusDuringRetry = useNotificationsStore.getState().feedStatus
      return { notifications: [], announcements: [], unread_count: 0 }
    })
    await useNotificationsStore.getState().fetchFeed()
    expect(statusDuringRetry).toBe('loading')
  })

  it('fetchMore stays blocked during a BACKGROUND refresh, when the status says ready', async () => {
    // Why the in-flight flag survived as its own field. Collapsing it into
    // feedStatus would have made this pass silently: the guard keeps a settled
    // feed on 'ready', so a status-based check would see "not loading" and let
    // fetchMore append against a cursor the concurrent refresh is about to
    // invalidate — it replaces the list wholesale.
    notificationsApi.feed.mockResolvedValue({
      notifications: page(NOTIFICATION_PAGE_SIZE),
      announcements: [],
      unread_count: 0,
    })
    await useNotificationsStore.getState().fetchFeed()
    expect(useNotificationsStore.getState().hasMore).toBe(true)

    let moreCalledDuringRefresh = false
    notificationsApi.feed.mockImplementation(async (q) => {
      if (q?.before_id !== undefined) moreCalledDuringRefresh = true
      else await useNotificationsStore.getState().fetchMore()
      return { notifications: [], announcements: [], unread_count: 0 }
    })
    await useNotificationsStore.getState().fetchFeed()

    expect(useNotificationsStore.getState().feedStatus).toBe('ready')
    expect(moreCalledDuringRefresh).toBe(false)
  })
})

describe('fetchFeed', () => {
  it('stores the feed, badge count, and a full page means more may exist', async () => {
    notificationsApi.feed.mockResolvedValue({
      notifications: page(NOTIFICATION_PAGE_SIZE),
      announcements: [{ id: 'a1', title: 'Fees', body: 'Fee update', priority: 1, published_at: null, expires_at: null }],
      unread_count: 7,
    })
    await useNotificationsStore.getState().fetchFeed()
    const s = useNotificationsStore.getState()
    expect(s.unread).toBe(7)
    expect(s.announcements).toHaveLength(1)
    expect(s.hasMore).toBe(true)
    expect(s.isFetchingFeed).toBe(false)
  })

  it('a short page means the feed is complete; a failure clears loading', async () => {
    notificationsApi.feed.mockResolvedValue({ notifications: page(2), announcements: [], unread_count: 0 })
    await useNotificationsStore.getState().fetchFeed()
    expect(useNotificationsStore.getState().hasMore).toBe(false)
    expect(useNotificationsStore.getState().feedStatus).toBe('ready')

    notificationsApi.feed.mockRejectedValue(new Error('down'))
    await useNotificationsStore.getState().fetchFeed()
    expect(useNotificationsStore.getState().isFetchingFeed).toBe(false)
  })

  it('RECORDS a failure rather than only swallowing it', async () => {
    // The rejection is still swallowed — every caller is a badge refresh that
    // must not reject — but a surface reading only `loading` cannot tell a
    // failed load from an empty account, and told the reader "Nothing new".
    notificationsApi.feed.mockRejectedValue(new Error('down'))
    await expect(useNotificationsStore.getState().fetchFeed()).resolves.toBeUndefined()
    expect(useNotificationsStore.getState().feedStatus).toBe('error')
  })
})

describe('fetchMore', () => {
  it('pages from the oldest loaded id and dedupes overlap', async () => {
    useNotificationsStore.setState({ notifications: page(NOTIFICATION_PAGE_SIZE), hasMore: true })
    const older = [notice({ id: `n-${NOTIFICATION_PAGE_SIZE - 1}` }), notice({ id: 'older-1' })]
    notificationsApi.feed.mockResolvedValue({ notifications: older, announcements: [], unread_count: 0 })

    await useNotificationsStore.getState().fetchMore()
    expect(notificationsApi.feed).toHaveBeenCalledWith({ before_id: `n-${NOTIFICATION_PAGE_SIZE - 1}` })
    const ids = useNotificationsStore.getState().notifications.map((n) => n.id)
    expect(ids.filter((id) => id === `n-${NOTIFICATION_PAGE_SIZE - 1}`)).toHaveLength(1) // deduped
    expect(ids).toContain('older-1')
    expect(useNotificationsStore.getState().hasMore).toBe(false) // short page
  })

  it('is inert without a cursor, when exhausted, or while loading', async () => {
    await useNotificationsStore.getState().fetchMore() // empty list → no cursor
    useNotificationsStore.setState({ notifications: page(3), hasMore: false })
    await useNotificationsStore.getState().fetchMore() // exhausted
    useNotificationsStore.setState({ hasMore: true, isFetchingFeed: true })
    await useNotificationsStore.getState().fetchMore() // initial load in flight
    expect(notificationsApi.feed).not.toHaveBeenCalled()
  })
})

describe('badge + receive', () => {
  it('refreshUnread is server-authoritative and keeps the last value on failure', async () => {
    notificationsApi.unreadCount.mockResolvedValue({ count: 4 })
    await useNotificationsStore.getState().refreshUnread()
    expect(useNotificationsStore.getState().unread).toBe(4)

    notificationsApi.unreadCount.mockRejectedValue(new Error('down'))
    await useNotificationsStore.getState().refreshUnread()
    expect(useNotificationsStore.getState().unread).toBe(4)
  })

  it('receive prepends, bumps only unread notices, and dedupes by id', () => {
    const s = useNotificationsStore.getState()
    s.receive(notice({ id: 'n1' }))
    s.receive(notice({ id: 'n1' })) // duplicate frame
    s.receive(notice({ id: 'n2', read_at: '2026-08-15T10:00:00.000Z' })) // already read
    const after = useNotificationsStore.getState()
    expect(after.notifications.map((n) => n.id)).toEqual(['n2', 'n1'])
    expect(after.unread).toBe(1)
  })
})

describe('mark read', () => {
  it('markRead is optimistic, floors at zero, and skips read/absent notices', async () => {
    useNotificationsStore.setState({ notifications: [notice({ id: 'n1' })], unread: 1 })
    notificationsApi.markRead.mockResolvedValue({ ok: true })
    await useNotificationsStore.getState().markRead('n1')
    expect(useNotificationsStore.getState().unread).toBe(0)
    expect(useNotificationsStore.getState().notifications[0].read_at).not.toBeNull()

    await useNotificationsStore.getState().markRead('n1') // already read
    await useNotificationsStore.getState().markRead('ghost') // absent
    expect(notificationsApi.markRead).toHaveBeenCalledTimes(1)
  })

  it('markAllRead clears every notice and the badge optimistically', async () => {
    useNotificationsStore.setState({
      notifications: [notice({ id: 'n1' }), notice({ id: 'n2' })],
      unread: 2,
    })
    notificationsApi.markAllRead.mockResolvedValue({ ok: true })
    await useNotificationsStore.getState().markAllRead()
    const s = useNotificationsStore.getState()
    expect(s.unread).toBe(0)
    expect(s.notifications.every((n) => n.read_at !== null)).toBe(true)
    expect(notificationsApi.markAllRead).toHaveBeenCalledTimes(1)
  })

  it('markAllRead unpins the broadcasts too, so a cleared notice cannot outrank newer rows', async () => {
    // Mobile's twin assertion. The badge used to clear while the pinned card
    // stayed above every personal row until a refetch; the server now serves
    // only post-cursor broadcasts, so keeping them locally shows a card it
    // would no longer send.
    useNotificationsStore.setState({
      notifications: [notice({ id: 'n1' })],
      announcements: [
        { id: 'x', title: 'Maintenance', body: 'b', priority: 0, published_at: null, expires_at: null },
      ],
      unread: 2,
    })
    notificationsApi.markAllRead.mockResolvedValue({ ok: true })
    await useNotificationsStore.getState().markAllRead()
    expect(useNotificationsStore.getState().announcements).toEqual([])
  })

  it('a failing markRead keeps the optimistic state (next fetch reconciles)', async () => {
    useNotificationsStore.setState({ notifications: [notice({ id: 'n1' })], unread: 1 })
    notificationsApi.markRead.mockRejectedValue(new Error('down'))
    await useNotificationsStore.getState().markRead('n1')
    expect(useNotificationsStore.getState().unread).toBe(0)
  })
})

it('reset drops everything for the next account', () => {
  useNotificationsStore.setState({ notifications: page(3), unread: 3, hasMore: true })
  useNotificationsStore.getState().reset()
  const s = useNotificationsStore.getState()
  expect(s.notifications).toEqual([])
  expect(s.unread).toBe(0)
  expect(s.hasMore).toBe(false)
})

describe('error paths that had no coverage (adjacent to #48, not part of its DoD)', () => {
  it('a failed fetchMore clears its own spinner and keeps the rows already loaded', async () => {
    notificationsApi.feed.mockResolvedValue({
      notifications: page(NOTIFICATION_PAGE_SIZE),
      announcements: [],
      unread_count: 0,
    })
    await useNotificationsStore.getState().fetchFeed()

    notificationsApi.feed.mockRejectedValue(new Error('down'))
    await useNotificationsStore.getState().fetchMore()

    const s = useNotificationsStore.getState()
    expect(s.loadingMore).toBe(false)
    // The page the reader already has is still theirs; the next end-reach retries.
    expect(s.notifications).toHaveLength(NOTIFICATION_PAGE_SIZE)
    expect(s.feedStatus).toBe('ready')
  })

  it('a failed markAllRead leaves the badge optimistically cleared, to reconcile on next fetch', async () => {
    notificationsApi.feed.mockResolvedValue({
      notifications: [notice({ id: 'n1' })],
      announcements: [],
      unread_count: 1,
    })
    await useNotificationsStore.getState().fetchFeed()
    expect(useNotificationsStore.getState().unread).toBe(1)

    notificationsApi.markAllRead.mockRejectedValue(new Error('down'))
    await useNotificationsStore.getState().markAllRead()

    // Deliberately NOT rolled back: the badge is a hint, and a bounce back to
    // "1 unread" after the reader cleared it reads as the app arguing with them.
    expect(useNotificationsStore.getState().unread).toBe(0)
  })
})
