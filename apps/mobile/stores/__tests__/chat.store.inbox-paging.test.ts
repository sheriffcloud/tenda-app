/**
 * The inbox pages: `fetchConversations` refreshes the NEWEST page, and
 * `loadMoreConversations` walks older ones by the id of the last row held.
 *
 * The interesting behaviour is not "it appends". It is what happens when the two
 * run into each other. Refreshes are frequent (focus, the poll, every realtime
 * frame), so a refresh that replaced the list would throw away the pages a user
 * had just scrolled to; and a page requested from one end of the list must not
 * be glued to a list that ends somewhere else by the time it arrives.
 *
 * The api client is mocked at its seam and the wire query is asserted exactly:
 * drift there is drift against the server.
 */
const mockList = jest.fn()

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: {
    conversations: {
      list: (query?: ConversationsQuery) => mockList(query),
    },
  },
}))

import { INBOX_PAGE_SIZE, type Conversation, type ConversationsQuery } from '@tenda/shared'
import { useChatStore } from '@/stores/chat.store'
import { conversation as conv, resetChatStore } from '../__fixtures__/chat'
import { deferred } from '../__fixtures__/account-switch'

/** `count` conversations c<from>… in server order (zero-padded so ids sort). */
function batch(from: number, count: number, over: Partial<Conversation> = {}): Conversation[] {
  return Array.from({ length: count }, (_, i) => conv({ id: `c${String(from + i).padStart(3, '0')}`, ...over }))
}
const ids = (list: readonly Conversation[]): string[] => list.map((c) => c.id)
const state = () => useChatStore.getState()

beforeEach(() => {
  resetChatStore()
  mockList.mockReset()
})

describe('fetchConversations: the newest page', () => {
  test('asks for exactly one inbox page', async () => {
    mockList.mockResolvedValue([])
    await state().fetchConversations()
    expect(mockList).toHaveBeenCalledWith({ limit: INBOX_PAGE_SIZE })
  })

  test('a FULL page means there may be more; a short one, or none, means the end', async () => {
    mockList.mockResolvedValue(batch(1, INBOX_PAGE_SIZE))
    await state().fetchConversations()
    expect(state().hasMoreConversations).toBe(true)

    resetChatStore()
    mockList.mockResolvedValue(batch(1, INBOX_PAGE_SIZE - 1))
    await state().fetchConversations()
    expect(state().hasMoreConversations).toBe(false)

    resetChatStore()
    mockList.mockResolvedValue([])
    await state().fetchConversations()
    expect(state().hasMoreConversations).toBe(false)
  })
})

describe('loadMoreConversations: older pages', () => {
  test('continues from the LAST row held, appends, and re-sums the unread badge', async () => {
    mockList.mockResolvedValueOnce(batch(1, INBOX_PAGE_SIZE, { unread_count: 1 }))
    await state().fetchConversations()
    mockList.mockResolvedValueOnce(batch(INBOX_PAGE_SIZE + 1, 3, { unread_count: 2 }))

    await state().loadMoreConversations()

    expect(mockList).toHaveBeenLastCalledWith({ before_id: `c${String(INBOX_PAGE_SIZE).padStart(3, '0')}`, limit: INBOX_PAGE_SIZE })
    expect(state().conversations).toHaveLength(INBOX_PAGE_SIZE + 3)
    expect(state().unread).toBe(INBOX_PAGE_SIZE * 1 + 3 * 2)
    expect(state().hasMoreConversations).toBe(false)
    expect(state().loadingMoreConversations).toBe(false)
  })

  test('a full older page keeps the door open for the next one', async () => {
    mockList.mockResolvedValueOnce(batch(1, INBOX_PAGE_SIZE))
    await state().fetchConversations()
    mockList.mockResolvedValueOnce(batch(INBOX_PAGE_SIZE + 1, INBOX_PAGE_SIZE))
    await state().loadMoreConversations()
    expect(state().hasMoreConversations).toBe(true)
  })

  test('does nothing when there is nothing older, nothing held, or a page is already coming', async () => {
    await state().loadMoreConversations() // nothing held
    mockList.mockResolvedValueOnce(batch(1, 3))
    await state().fetchConversations() // short page => no more
    mockList.mockClear()
    await state().loadMoreConversations()
    expect(mockList).not.toHaveBeenCalled()
  })

  test('two scrolls to the end in a row make ONE request', async () => {
    mockList.mockResolvedValueOnce(batch(1, INBOX_PAGE_SIZE))
    await state().fetchConversations()
    const page = deferred<Conversation[]>()
    mockList.mockReturnValueOnce(page.promise)

    const first = state().loadMoreConversations()
    const second = state().loadMoreConversations()
    page.resolve(batch(INBOX_PAGE_SIZE + 1, 2))
    await Promise.all([first, second])

    expect(mockList).toHaveBeenCalledTimes(2) // the refresh + exactly one page
    expect(ids(state().conversations)).toHaveLength(INBOX_PAGE_SIZE + 2)
  })

  test('a row already held is not appended twice', async () => {
    mockList.mockResolvedValueOnce(batch(1, INBOX_PAGE_SIZE))
    await state().fetchConversations()
    // The older page repeats the last row held (a shifted window) and adds one.
    mockList.mockResolvedValueOnce([...batch(INBOX_PAGE_SIZE, 1), ...batch(INBOX_PAGE_SIZE + 1, 1)])
    await state().loadMoreConversations()
    // The ARRAY, not a Set of it: a Set would hide the very duplicate under test.
    expect(ids(state().conversations)).toEqual(
      ids([...batch(1, INBOX_PAGE_SIZE), ...batch(INBOX_PAGE_SIZE + 1, 1)]),
    )
  })

  test('a FAILED page leaves the list alone, still allows another try, and never rejects', async () => {
    mockList.mockResolvedValueOnce(batch(1, INBOX_PAGE_SIZE))
    await state().fetchConversations()
    mockList.mockRejectedValueOnce(new Error('offline'))

    await expect(state().loadMoreConversations()).resolves.toBeUndefined()

    expect(state().conversations).toHaveLength(INBOX_PAGE_SIZE)
    expect(state().hasMoreConversations).toBe(true)
    expect(state().loadingMoreConversations).toBe(false)

    mockList.mockResolvedValueOnce(batch(INBOX_PAGE_SIZE + 1, 1))
    await state().loadMoreConversations()
    expect(state().conversations).toHaveLength(INBOX_PAGE_SIZE + 1)
  })
})

describe('a refresh does not throw away the pages already scrolled to', () => {
  /** A full page plus a 3-row tail already loaded beyond it. */
  async function holdTail(): Promise<void> {
    mockList.mockResolvedValueOnce(batch(1, INBOX_PAGE_SIZE))
    await state().fetchConversations()
    mockList.mockResolvedValueOnce(batch(INBOX_PAGE_SIZE + 1, 3))
    await state().loadMoreConversations()
    mockList.mockReset()
  }

  test('the fresh page replaces the old one and the tail beyond it is kept, in order', async () => {
    await holdTail()
    // A newer message moved c001 to the front; the page still ends at c050.
    mockList.mockResolvedValueOnce([conv({ id: 'c001', last_message: 'new' }), ...batch(2, INBOX_PAGE_SIZE - 1)])
    await state().fetchConversations()

    expect(state().conversations).toHaveLength(INBOX_PAGE_SIZE + 3)
    expect(state().conversations[0].last_message).toBe('new')
    expect(ids(state().conversations).slice(-3)).toEqual(ids(batch(INBOX_PAGE_SIZE + 1, 3)))
  })

  test('hasMore is left to what the last older page said, not recomputed from the newest', async () => {
    await holdTail() // the older page was short => hasMore false
    expect(state().hasMoreConversations).toBe(false)
    mockList.mockResolvedValueOnce(batch(1, INBOX_PAGE_SIZE)) // a full newest page
    await state().fetchConversations()
    expect(state().hasMoreConversations).toBe(false)
  })

  test('a row the newest page no longer lists (closed since) is gone, not kept as a tail', async () => {
    await holdTail()
    // c010 was closed: the page now reaches one further, to c051.
    const page = [...batch(1, 9), ...batch(11, INBOX_PAGE_SIZE - 9)]
    mockList.mockResolvedValueOnce(page)
    await state().fetchConversations()

    expect(ids(state().conversations)).not.toContain('c010')
    expect(ids(state().conversations).slice(0, page.length)).toEqual(ids(page))
  })

  test('a row that climbed from the tail into the newest page appears once, at its new place', async () => {
    await holdTail()
    const climbed = conv({ id: `c${String(INBOX_PAGE_SIZE + 2).padStart(3, '0')}`, last_message: 'bumped' })
    mockList.mockResolvedValueOnce([climbed, ...batch(1, INBOX_PAGE_SIZE - 1)])
    await state().fetchConversations()

    const held = ids(state().conversations)
    expect(held.filter((id) => id === climbed.id)).toHaveLength(1)
    expect(held[0]).toBe(climbed.id)
  })

  test('a newest page whose last row was never held starts over from the page', async () => {
    await holdTail()
    mockList.mockResolvedValueOnce(batch(500, INBOX_PAGE_SIZE))
    await state().fetchConversations()
    expect(ids(state().conversations)).toEqual(ids(batch(500, INBOX_PAGE_SIZE)))
    expect(state().hasMoreConversations).toBe(true)
  })

  test('a SHORT newest page is the whole list: anything held beyond it has closed', async () => {
    await holdTail()
    mockList.mockResolvedValueOnce(batch(1, 5))
    await state().fetchConversations()
    expect(ids(state().conversations)).toEqual(ids(batch(1, 5)))
    expect(state().hasMoreConversations).toBe(false)
  })
})

describe('a page that arrives after the list has moved', () => {
  test('is discarded rather than glued on, and the flag is released', async () => {
    mockList.mockResolvedValueOnce(batch(1, INBOX_PAGE_SIZE))
    await state().fetchConversations()
    const page = deferred<Conversation[]>()
    mockList.mockReturnValueOnce(page.promise)

    const pending = state().loadMoreConversations()
    // While the page is in flight the user closes the thread it continues from.
    const last = state().conversations[state().conversations.length - 1]
    useChatStore.setState({ conversations: state().conversations.filter((c) => c.id !== last.id) })
    page.resolve(batch(INBOX_PAGE_SIZE + 1, 2))
    await pending

    expect(ids(state().conversations)).not.toContain(`c${String(INBOX_PAGE_SIZE + 1).padStart(3, '0')}`)
    expect(state().loadingMoreConversations).toBe(false)

    // The next scroll asks again, from where the list ends NOW.
    mockList.mockResolvedValueOnce([])
    await state().loadMoreConversations()
    const after = state().conversations
    expect(mockList).toHaveBeenLastCalledWith({ before_id: after[after.length - 1].id, limit: INBOX_PAGE_SIZE })
  })
})
