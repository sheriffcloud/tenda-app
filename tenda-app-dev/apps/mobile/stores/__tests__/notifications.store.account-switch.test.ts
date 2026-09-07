/**
 * notifications.store's in-flight guards (#65).
 *
 * The bell holds two account-scoped things — the notices themselves and the
 * badge count — written by three different requests. `markRead` and
 * `markAllRead` are deliberately absent: they write nothing after their await,
 * so a guard on them would be decoration.
 */
import { useNotificationsStore } from '@/stores/notifications.store'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/api/client'
import { feed, notif } from '../__fixtures__/notifications'
import { deferred } from '../__fixtures__/account-switch'

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: { notifications: { feed: jest.fn(), unreadCount: jest.fn() } },
}))
jest.mock('@/lib/secure-store', () => ({
  clearAuthStorage: jest.fn(async () => {}),
  getJwtToken:      jest.fn(async () => null),
  getWalletAddress: jest.fn(async () => null),
  setJwtToken:      jest.fn(async () => {}),
  setWalletAddress: jest.fn(async () => {}),
}))

const feedMock = api.notifications.feed as jest.MockedFunction<typeof api.notifications.feed>
const unreadMock = api.notifications.unreadCount as jest.MockedFunction<
  typeof api.notifications.unreadCount
>

beforeEach(() => {
  useNotificationsStore.getState().reset()
  jest.clearAllMocks()
})

test('a notification feed in flight at sign-out does not repopulate the bell', async () => {
  const response = deferred<Awaited<ReturnType<typeof api.notifications.feed>>>()
  feedMock.mockReturnValue(response.promise)

  const pending = useNotificationsStore.getState().fetchFeed()
  await useAuthStore.getState().logout()
  response.resolve(feed({ notifications: [notif('n1')], unread_count: 7 }))
  await pending

  const bell = useNotificationsStore.getState()
  expect(bell.notifications).toEqual([])
  // The badge is its own field, so an assertion on the list alone would miss it.
  expect(bell.unread).toBe(0)
  // And the status is back at rest, not stranded on the abandoned load.
  expect(bell.feedStatus).toBe('idle')
})

test('a FAILED notification feed after sign-out does not banner an error on the new bell', async () => {
  // `feedStatus: 'error'` is a retry banner, and one raised by the previous
  // account's failed load is a banner the next account cannot explain.
  const response = deferred<Awaited<ReturnType<typeof api.notifications.feed>>>()
  feedMock.mockReturnValue(response.promise.then(() => Promise.reject(new Error('offline'))))

  const pending = useNotificationsStore.getState().fetchFeed()
  await useAuthStore.getState().logout()
  response.resolve(feed())
  await pending

  expect(useNotificationsStore.getState().feedStatus).toBe('idle')
})

test('an unread-count refresh in flight at sign-out does not leave a badge behind', async () => {
  const response = deferred<Awaited<ReturnType<typeof api.notifications.unreadCount>>>()
  unreadMock.mockReturnValue(response.promise)

  const pending = useNotificationsStore.getState().refreshUnread()
  await useAuthStore.getState().logout()
  response.resolve({ count: 9 })
  await pending

  expect(useNotificationsStore.getState().unread).toBe(0)
})

test('an older notification page in flight at sign-out does not append to the new bell', async () => {
  const response = deferred<Awaited<ReturnType<typeof api.notifications.feed>>>()
  // `hasMore` and a non-null cursor both matter: fetchMore returns before it
  // issues anything without them, and a case that never makes the request
  // cannot witness the guard — measured, it did not until this line was added.
  useNotificationsStore.setState({ notifications: [notif('n0')], hasMore: true })
  feedMock.mockReturnValue(response.promise)

  const pending = useNotificationsStore.getState().fetchMore()
  await useAuthStore.getState().logout()
  response.resolve(feed({ notifications: [notif('n1')] }))
  await pending

  expect(useNotificationsStore.getState().notifications).toEqual([])
})

test("a FAILED older page after sign-out does not clear the new account's spinner", async () => {
  // The catch writes `loadingMore: false`, which looks harmless — after the
  // clear that field is already false. It stops being harmless the moment the
  // NEXT account has a load of its own running.
  const response = deferred<Awaited<ReturnType<typeof api.notifications.feed>>>()
  useNotificationsStore.setState({ notifications: [notif('n0')], hasMore: true })
  feedMock.mockReturnValue(response.promise.then(() => Promise.reject(new Error('offline'))))

  const pending = useNotificationsStore.getState().fetchMore()
  await useAuthStore.getState().logout()
  useNotificationsStore.setState({ loadingMore: true }) // the next account, mid-load
  response.resolve(feed())
  await pending

  expect(useNotificationsStore.getState().loadingMore).toBe(true)
})
