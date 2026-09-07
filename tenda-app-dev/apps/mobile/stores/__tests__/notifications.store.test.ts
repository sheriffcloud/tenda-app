/**
 * Notification-centre store (Stage 5) — the badge's source of truth. Covers
 * fetchFeed (populate + unread + hasMore), cursor pagination, WS receive
 * (prepend / dedupe / unread bump), optimistic markRead + markAllRead,
 * refreshUnread, and error tolerance (a failed fetch never wedges the
 * in-flight flag).
 */
jest.mock('@/api/client', () => ({
  api: {
    notifications: {
      feed: jest.fn(),
      unreadCount: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    },
  },
}))

import { NOTIFICATION_PAGE_SIZE } from '@tenda/shared'
import { useNotificationsStore } from '@/stores/notifications.store'
import { api } from '@/api/client'
import { feed, fullPage, notif } from '../__fixtures__/notifications'

const feedMock = api.notifications.feed as jest.Mock
const unreadMock = api.notifications.unreadCount as jest.Mock
const markReadMock = api.notifications.markRead as jest.Mock
const markAllMock = api.notifications.markAllRead as jest.Mock

const store = () => useNotificationsStore.getState()

beforeEach(() => {
  jest.clearAllMocks()
  useNotificationsStore.setState({
    notifications: [],
    announcements: [],
    unread: 0,
    isFetchingFeed: false,
    feedStatus: 'idle',
    loadingMore: false,
    hasMore: false,
  })
})

describe('fetchFeed', () => {
  test('populates notifications + announcements, sets unread, hasMore true on a full page', async () => {
    feedMock.mockResolvedValueOnce(
      feed({ notifications: fullPage(), announcements: [{ id: 'a1', title: 'A', body: 'b', priority: 0, published_at: null, expires_at: null }], unread_count: 7 }),
    )
    await store().fetchFeed()
    expect(store().notifications).toHaveLength(NOTIFICATION_PAGE_SIZE)
    expect(store().announcements).toHaveLength(1)
    expect(store().unread).toBe(7)
    expect(store().hasMore).toBe(true)
    expect(store().isFetchingFeed).toBe(false)
  })

  test('hasMore is false on a short page', async () => {
    feedMock.mockResolvedValueOnce(feed({ notifications: [notif('a')], unread_count: 1 }))
    await store().fetchFeed()
    expect(store().hasMore).toBe(false)
  })

  test('a failed fetch never wedges the in-flight flag and leaves state intact', async () => {
    feedMock.mockRejectedValueOnce(new Error('network'))
    await store().fetchFeed()
    expect(store().isFetchingFeed).toBe(false)
    expect(store().notifications).toHaveLength(0)
  })
})

describe('fetchMore', () => {
  test('appends the next page using the oldest loaded id as before_id', async () => {
    const first = fullPage('n')
    useNotificationsStore.setState({ notifications: first, hasMore: true })
    feedMock.mockResolvedValueOnce(feed({ notifications: [notif('older')], unread_count: 0 }))

    await store().fetchMore()

    expect(feedMock).toHaveBeenCalledWith({ before_id: first[first.length - 1].id })
    expect(store().notifications).toHaveLength(NOTIFICATION_PAGE_SIZE + 1)
    expect(store().hasMore).toBe(false)
  })

  test('is a no-op when there is nothing more to load', async () => {
    useNotificationsStore.setState({ notifications: [notif('a')], hasMore: false })
    await store().fetchMore()
    expect(feedMock).not.toHaveBeenCalled()
  })

  test('drops ids already present so a refresh race cannot duplicate a key', async () => {
    const page = fullPage('n')
    useNotificationsStore.setState({ notifications: page, hasMore: true })
    // The returned page overlaps the last existing row + one genuinely older row.
    feedMock.mockResolvedValueOnce(feed({ notifications: [page[page.length - 1], notif('older')] }))

    await store().fetchMore()

    const ids = store().notifications.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length) // no duplicate keys
    expect(ids).toContain('older')
    expect(store().notifications).toHaveLength(NOTIFICATION_PAGE_SIZE + 1)
  })
})

describe('receive (WS delivery)', () => {
  test('prepends an unread notice and bumps the badge', () => {
    store().receive(notif('new'))
    expect(store().notifications[0].id).toBe('new')
    expect(store().unread).toBe(1)
  })

  test('dedupes a notice already present (no double count)', () => {
    store().receive(notif('dup'))
    store().receive(notif('dup'))
    expect(store().notifications).toHaveLength(1)
    expect(store().unread).toBe(1)
  })

  test('an already-read notice does not bump the badge', () => {
    store().receive(notif('r', true))
    expect(store().unread).toBe(0)
  })
})

describe('markRead', () => {
  test('optimistically marks read, decrements the badge, and persists', async () => {
    useNotificationsStore.setState({ notifications: [notif('x')], unread: 1 })
    markReadMock.mockResolvedValueOnce({ ok: true })
    await store().markRead('x')
    expect(store().notifications[0].read_at).not.toBeNull()
    expect(store().unread).toBe(0)
    expect(markReadMock).toHaveBeenCalledWith({ id: 'x' })
  })

  test('is a no-op for an already-read notice (no server call, no underflow)', async () => {
    useNotificationsStore.setState({ notifications: [notif('x', true)], unread: 0 })
    await store().markRead('x')
    expect(markReadMock).not.toHaveBeenCalled()
    expect(store().unread).toBe(0)
  })
})

describe('markAllRead', () => {
  test('clears the badge, marks every notice read, and persists', async () => {
    useNotificationsStore.setState({ notifications: [notif('a'), notif('b')], unread: 2 })
    markAllMock.mockResolvedValueOnce({ ok: true })
    await store().markAllRead()
    expect(store().unread).toBe(0)
    expect(store().notifications.every((n) => n.read_at !== null)).toBe(true)
    expect(markAllMock).toHaveBeenCalledTimes(1)
  })

  test('unpins the broadcasts too, so a cleared notice cannot outrank newer rows', async () => {
    // The reported bug: the badge went to zero and the announcement stayed
    // pinned above the list until something happened to refetch. The server
    // now serves only post-cursor broadcasts, so holding this set locally
    // shows the reader a card the server would no longer send.
    useNotificationsStore.setState({
      notifications: [notif('a')],
      announcements: [
        { id: 'x', title: 'Maintenance', body: 'b', priority: 0, published_at: null, expires_at: null },
      ],
      unread: 2,
    })
    markAllMock.mockResolvedValueOnce({ ok: true })
    await store().markAllRead()
    expect(store().announcements).toEqual([])
  })
})

describe('reset', () => {
  test('drops all state so the next account starts clean', () => {
    useNotificationsStore.setState({ notifications: [notif('a')], announcements: [{ id: 'x', title: 'A', body: 'b', priority: 0, published_at: null, expires_at: null }], unread: 5, hasMore: true })
    store().reset()
    expect(store().notifications).toHaveLength(0)
    expect(store().announcements).toHaveLength(0)
    expect(store().unread).toBe(0)
    expect(store().hasMore).toBe(false)
  })
})

describe('refreshUnread', () => {
  test('sets the badge from the server count', async () => {
    unreadMock.mockResolvedValueOnce({ count: 9 })
    await store().refreshUnread()
    expect(store().unread).toBe(9)
  })

  test('keeps the last value when the request fails', async () => {
    useNotificationsStore.setState({ unread: 3 })
    unreadMock.mockRejectedValueOnce(new Error('offline'))
    await store().refreshUnread()
    expect(store().unread).toBe(3)
  })
})

test('a failed fetchMore clears its own spinner and keeps the rows already loaded', () => {
  // The append path's negative half, which web's twin suite pins and this one
  // did not: a page that fails must not strand the footer spinner, and must
  // not take away the page the reader already has.
  feedMock.mockResolvedValueOnce(feed({ notifications: fullPage() }))
  return store()
    .fetchFeed()
    .then(() => {
      feedMock.mockRejectedValueOnce(new Error('down'))
      return store().fetchMore()
    })
    .then(() => {
      expect(store().loadingMore).toBe(false)
      expect(store().notifications).toHaveLength(NOTIFICATION_PAGE_SIZE)
      expect(store().feedStatus).toBe('ready')
    })
})

test('fetchMore with nothing loaded asks for nothing — there is no cursor yet', async () => {
  // The `oldestId` null arm. Without a first page there is no cursor, and
  // requesting `before_id: undefined` would silently re-fetch page one and
  // append it to itself.
  useNotificationsStore.setState({ notifications: [], hasMore: true })
  await store().fetchMore()
  expect(feedMock).not.toHaveBeenCalled()
})

test('markRead marks ONLY the notice it was given', async () => {
  // Selectivity, previously unproven: every case had a single notice, so the
  // "leave the others alone" arm of the map never ran.
  feedMock.mockResolvedValueOnce(feed({ notifications: [notif('n1'), notif('n2')], unread_count: 2 }))
  await store().fetchFeed()
  markReadMock.mockResolvedValueOnce(undefined)

  await store().markRead('n1')

  const [first, second] = store().notifications
  expect(first.read_at).not.toBeNull()
  expect(second.read_at).toBeNull()
  expect(store().unread).toBe(1)
})

test('markAllRead does not re-stamp a notice that was already read', async () => {
  // The already-read arm. Re-stamping would move an old notice's read time
  // forward every time the reader cleared the badge.
  const alreadyRead = notif('n1', true)
  feedMock.mockResolvedValueOnce(feed({ notifications: [alreadyRead, notif('n2')], unread_count: 1 }))
  await store().fetchFeed()
  markAllMock.mockResolvedValueOnce(undefined)

  await store().markAllRead()

  expect(store().notifications[0].read_at).toBe(alreadyRead.read_at)
  expect(store().notifications[1].read_at).not.toBeNull()
  expect(store().unread).toBe(0)
})
