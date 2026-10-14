/**
 * chat.store's in-flight guards (#65 / web's #45).
 *
 * `account-switch.test.ts` proves the sign-out EMPTIES this store. That only
 * holds if nothing writes afterwards, and a request that left before the clear
 * returns after it — `set` does not care that the account has changed. One case
 * per writer, because each takes its own snapshot and a case that reaches one
 * leaves the others unproven.
 */
import { INBOX_PAGE_SIZE } from '@tenda/shared'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/api/client'
import { conversation as conv, message as msg, resetChatStore } from '../__fixtures__/chat'
import { deferred } from '../__fixtures__/account-switch'

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: {
    conversations: {
      list:         jest.fn(),
      findOrCreate: jest.fn(),
      messages:     jest.fn(),
      sendMessage:  jest.fn(),
    },
  },
}))
jest.mock('@/lib/secure-store', () => ({
  clearAuthStorage: jest.fn(async () => {}),
  getJwtToken:      jest.fn(async () => null),
  getWalletAddress: jest.fn(async () => null),
  setJwtToken:      jest.fn(async () => {}),
  setWalletAddress: jest.fn(async () => {}),
}))

const listMock = api.conversations.list as jest.MockedFunction<typeof api.conversations.list>
const findMock = api.conversations.findOrCreate as jest.MockedFunction<
  typeof api.conversations.findOrCreate
>
const messagesMock = api.conversations.messages as jest.MockedFunction<
  typeof api.conversations.messages
>
const sendMock = api.conversations.sendMessage as jest.MockedFunction<
  typeof api.conversations.sendMessage
>

beforeEach(() => {
  resetChatStore()
  jest.clearAllMocks()
})

test('a conversation list in flight at sign-out does not repopulate the inbox', async () => {
  const response = deferred<Awaited<ReturnType<typeof api.conversations.list>>>()
  listMock.mockReturnValue(response.promise)

  const pending = useChatStore.getState().fetchConversations()
  await useAuthStore.getState().logout()
  response.resolve([conv({ id: 'c1', last_message: 'private to account A', unread_count: 4 })])
  await pending

  const chat = useChatStore.getState()
  expect(chat.conversations).toEqual([])
  // The badge is the half a "conversations are empty" assertion misses:
  // `unread` is a separate field, summed from the same response.
  expect(chat.unread).toBe(0)
})

test('a findOrCreate in flight at sign-out does not file a thread into the new inbox', async () => {
  const response = deferred<Awaited<ReturnType<typeof api.conversations.findOrCreate>>>()
  findMock.mockReturnValue(response.promise)

  const pending = useChatStore.getState().findOrCreate('them')
  await useAuthStore.getState().logout()
  response.resolve(conv({ id: 'c1' }))
  const created = await pending

  // The CALLER is still answered — the screen that asked has navigated away,
  // and returning undefined would change the method's contract for everyone.
  expect(created.id).toBe('c1')
  expect(useChatStore.getState().conversations).toEqual([])
})

test("a message page in flight at sign-out does not put another account's words on screen", async () => {
  const response = deferred<Awaited<ReturnType<typeof api.conversations.messages>>>()
  messagesMock.mockReturnValue(response.promise)

  const pending = useChatStore.getState().fetchMessages('c1')
  await useAuthStore.getState().logout()
  response.resolve([msg({ id: 'm1', content: 'private to account A' })])
  const rows = await pending

  expect(rows).toHaveLength(1)
  expect(useChatStore.getState().messages).toEqual({})
})

test('a send that SUCCEEDS after sign-out does not resurrect its thread', async () => {
  const response = deferred<Awaited<ReturnType<typeof api.conversations.sendMessage>>>()
  sendMock.mockReturnValue(response.promise)

  const pending = useChatStore.getState().sendMessage('c1', 'private to account A')
  // The optimistic copy is already in the store here; the clear takes it with
  // everything else.
  await useAuthStore.getState().logout()
  response.resolve(msg({ id: 'm1', content: 'private to account A' }))
  await pending

  expect(useChatStore.getState().messages).toEqual({})
})

test('a send that FAILS after sign-out does not resurrect its thread either', async () => {
  // The failure arm writes too — it marks the message `failed` — so guarding
  // only the success path would leave a thread rebuilt by an error.
  const response = deferred<Awaited<ReturnType<typeof api.conversations.sendMessage>>>()
  sendMock.mockReturnValue(response.promise.then(() => Promise.reject(new Error('offline'))))

  const pending = useChatStore.getState().sendMessage('c1', 'private to account A')
  await useAuthStore.getState().logout()
  response.resolve(msg({ id: 'm1' }))
  await pending

  expect(useChatStore.getState().messages).toEqual({})
})

test('an older inbox page in flight at sign-out does not put account A\'s threads into account B\'s inbox', async () => {
  // loadMoreConversations is a writer of its own: it snapshots the account, then
  // appends. A page that left before the clear returns after it.
  listMock.mockResolvedValueOnce(Array.from({ length: INBOX_PAGE_SIZE }, (_, i) => conv({ id: `a${i}` })))
  await useChatStore.getState().fetchConversations()
  const response = deferred<Awaited<ReturnType<typeof api.conversations.list>>>()
  listMock.mockReturnValueOnce(response.promise)

  const pending = useChatStore.getState().loadMoreConversations()
  await useAuthStore.getState().logout()
  response.resolve([conv({ id: 'older', last_message: 'private to account A', unread_count: 9 })])
  await pending

  const chat = useChatStore.getState()
  expect(chat.conversations).toEqual([])
  expect(chat.unread).toBe(0)
  // The reset took the in-flight flag with it; a stuck `true` would block the
  // next account's first scroll forever.
  expect(chat.loadingMoreConversations).toBe(false)
})

test('an older page for account A is not appended when account B happens to end on the same shared thread', async () => {
  // The stale-page guard alone cannot see this: the page continues from thread
  // X, and X is ALSO the last row of the next account's list (A and B talk to
  // each other, so the conversation is in both inboxes). Only the account
  // snapshot tells the two lists apart.
  const shared = conv({ id: 'shared-thread' })
  listMock.mockResolvedValueOnce([
    ...Array.from({ length: INBOX_PAGE_SIZE - 1 }, (_, i) => conv({ id: `a${i}` })),
    shared,
  ])
  await useChatStore.getState().fetchConversations()
  const response = deferred<Awaited<ReturnType<typeof api.conversations.list>>>()
  listMock.mockReturnValueOnce(response.promise)

  const pending = useChatStore.getState().loadMoreConversations()
  await useAuthStore.getState().logout()
  // Account B signs in and loads an inbox that ends on the same thread.
  useChatStore.setState({ conversations: [conv({ id: 'b0' }), shared] })
  response.resolve([conv({ id: 'older-a', last_message: 'private to account A' })])
  await pending

  expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual(['b0', 'shared-thread'])
})
