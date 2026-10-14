/**
 * The notification feed's SETTLED-state discipline (#57).
 *
 * Split from notifications.store.test.ts, which these cases took to 297 lines —
 * three from the house limit — and which is about the store's mechanics rather
 * than about this one rule. What is pinned here is the distinction the store
 * carries two fields for: `feedStatus` is what a surface may claim, while
 * `isFetchingFeed` is merely whether a request is running.
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

import { useNotificationsStore } from '@/stores/notifications.store'
import { api } from '@/api/client'
import { feed, fullPage } from '../__fixtures__/notifications'

const feedMock = api.notifications.feed as jest.Mock

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

describe('a SETTLED feed keeps its answer through a refresh (#57)', () => {
  /** Settle the feed on a genuinely EMPTY account — the case the guard protects. */
  async function settleEmpty() {
    feedMock.mockResolvedValueOnce(feed())
    await store().fetchFeed()
    expect(store().feedStatus).toBe('ready')
  }

  test('a refresh does not re-raise the loading status over a settled EMPTY feed', async () => {
    // The screen withdraws its empty state while the status is 'loading'. On an
    // account with no notifications, every pull-to-refresh therefore made "No
    // notifications yet" disappear and come back.
    await settleEmpty()
    let statusDuringRefresh: string | null = null
    feedMock.mockImplementationOnce(async () => {
      statusDuringRefresh = store().feedStatus
      return feed()
    })
    await store().fetchFeed()
    expect(statusDuringRefresh).toBe('ready')
    // …and the in-flight flag still moved, because fetchMore depends on it.
    expect(store().isFetchingFeed).toBe(false)
  })

  test('a FAILED refresh does not replace a settled EMPTY feed with the error state', async () => {
    // "Could not load" over an account that simply has none is a worse lie than
    // saying nothing new arrived.
    await settleEmpty()
    feedMock.mockRejectedValueOnce(new Error('down'))
    await store().fetchFeed()
    expect(store().feedStatus).toBe('ready')
    expect(store().isFetchingFeed).toBe(false)
  })

  test('a FIRST load still raises the loading status', async () => {
    let statusDuringLoad: string | null = null
    feedMock.mockImplementationOnce(async () => {
      statusDuringLoad = store().feedStatus
      return feed()
    })
    await store().fetchFeed()
    expect(statusDuringLoad).toBe('loading')
  })

  test('a retry AFTER an error still raises the loading status', async () => {
    feedMock.mockRejectedValueOnce(new Error('down'))
    await store().fetchFeed()
    expect(store().feedStatus).toBe('error')

    let statusDuringRetry: string | null = null
    feedMock.mockImplementationOnce(async () => {
      statusDuringRetry = store().feedStatus
      return feed()
    })
    await store().fetchFeed()
    expect(statusDuringRetry).toBe('loading')
    expect(store().feedStatus).toBe('ready')
  })

  test('fetchMore stays blocked during a BACKGROUND refresh, when the status says ready', async () => {
    // Why the in-flight flag survives as its own field. Collapsing it into
    // feedStatus would make this pass silently: the guard keeps a settled feed
    // on 'ready', so a status-based check would see "not loading" and let
    // fetchMore append against a cursor the concurrent refresh is about to
    // invalidate — it replaces the list wholesale.
    feedMock.mockResolvedValueOnce(feed({ notifications: fullPage() }))
    await store().fetchFeed()
    expect(store().hasMore).toBe(true)

    let moreCalledDuringRefresh = false
    feedMock.mockImplementation(async (q?: { before_id?: string }) => {
      if (q?.before_id !== undefined) moreCalledDuringRefresh = true
      else await store().fetchMore()
      return feed()
    })
    await store().fetchFeed()

    expect(store().feedStatus).toBe('ready')
    expect(moreCalledDuringRefresh).toBe(false)
  })
})
