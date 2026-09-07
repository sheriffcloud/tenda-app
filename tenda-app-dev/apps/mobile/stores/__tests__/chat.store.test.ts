/**
 * The chat store's INBOX half (#59): the conversation list, the unread
 * accounting hung off it, the two directions fetchMessages reads in, and WS
 * delivery into a thread that is already there.
 *
 * `receiveMessage` moved here from the send half in #72, which is where web
 * has always kept it — the two clients now partition this store the same way,
 * and the send file had grown past the house limit.
 *
 * The store had no suite at all and sat outside the coverage gate as well, so
 * both halves of #58's problem applied to it at once. The send half — temp
 * ids, the WS-echo race, retry — is next door in chat.store.send.test.ts;
 * together they run past the house limit.
 *
 * The cases follow web's stores/__tests__/chat.store.test.ts, which is the
 * same store by a different renderer, and add the two mobile's own shape asks
 * for: the no-cursor call and the replace-in-place arm.
 *
 * The api client is mocked at its seam and the assertions pin exact wire
 * bodies — drift there is drift against the server, not just against web.
 */
const mockList = jest.fn()
const mockFindOrCreate = jest.fn()
const mockMessages = jest.fn()
const mockClose = jest.fn()

// Typed at the seam rather than `(...a: unknown[])`, for the documentation
// value and nothing more. Measured, twice: `toHaveBeenCalledWith` is loosely
// typed so these annotations do not compile-check the assertions (#51), and
// jest.mock's factory return is not checked against the real module either —
// writing `body: number` here leaves tsc green. What they DO give is a
// statement of the contract the wire assertions below are pinning.
jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: {
    conversations: {
      list:         () => mockList(),
      findOrCreate: (body: { user_id: string }) => mockFindOrCreate(body),
      messages:     (params: { id: string }, query?: MessagesQuery) => mockMessages(params, query),
      close:        (params: { id: string }) => mockClose(params),
    },
  },
}))

import { ATTACHMENT_PREVIEW, type MessagesQuery, type User } from '@tenda/shared'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { conversation as conv, message as msg, localMessage, resetChatStore } from '../__fixtures__/chat'

beforeEach(() => {
  resetChatStore()
  // Narrowed to User, not cast to `never`: the store reads `user?.id` and
  // nothing else, and this way a fixture that got the id's TYPE wrong still
  // fails to compile.
  useAuthStore.setState({ user: { id: 'me' } as User })
})

describe('conversations', () => {
  test('fetchConversations stores the list and sums unread across threads', async () => {
    mockList.mockResolvedValue([conv({ id: 'c1', unread_count: 2 }), conv({ id: 'c2', unread_count: 3 })])
    await useChatStore.getState().fetchConversations()
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(useChatStore.getState().unread).toBe(5)
  })

  test('findOrCreate prepends a NEW conversation and replaces a known one in place', async () => {
    mockFindOrCreate.mockResolvedValue(conv({ id: 'c9' }))
    await useChatStore.getState().findOrCreate('them')
    expect(mockFindOrCreate).toHaveBeenCalledWith({ user_id: 'them' })
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual(['c9'])

    // Reopening an existing thread must not duplicate the row: the server
    // reuses the conversation, so a second call carries the same id.
    mockFindOrCreate.mockResolvedValue(conv({ id: 'c9', last_message: 'reopened' }))
    await useChatStore.getState().findOrCreate('them')
    const list = useChatStore.getState().conversations
    expect(list).toHaveLength(1)
    expect(list[0].last_message).toBe('reopened')
  })

  test('findOrCreate replaces its own row and leaves the other threads untouched', () => {
    // The replace arm maps over the WHOLE list, so the branch that matters is
    // the one that returns every other conversation unchanged. Reopening one
    // thread must not rewrite the inbox around it.
    useChatStore.setState({
      conversations: [conv({ id: 'c1', last_message: 'first' }), conv({ id: 'c2', last_message: 'second' })],
    })
    mockFindOrCreate.mockResolvedValue(conv({ id: 'c2', last_message: 'reopened' }))

    return useChatStore.getState().findOrCreate('them').then(() => {
      const list = useChatStore.getState().conversations
      expect(list.map((c) => c.id)).toEqual(['c1', 'c2'])
      expect(list.map((c) => c.last_message)).toEqual(['first', 'reopened'])
    })
  })

  test('closeConversation removes the thread from the inbox', async () => {
    useChatStore.setState({ conversations: [conv({ id: 'c1' }), conv({ id: 'c2' })] })
    mockClose.mockResolvedValue(conv({ id: 'c1', status: 'closed' }))
    await useChatStore.getState().closeConversation('c1')
    expect(mockClose).toHaveBeenCalledWith({ id: 'c1' })
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual(['c2'])
  })
})

describe('fetchMessages', () => {
  test('reverses the newest-first wire order, keeps pending copies, clears unread locally', async () => {
    useChatStore.setState({
      conversations: [conv({ id: 'c1', unread_count: 4 }), conv({ id: 'c2', unread_count: 1 })],
      unread:        5,
      messages:      { c1: [localMessage({ id: 'temp_1', sender_id: 'me' })] },
    })
    mockMessages.mockResolvedValue([msg({ id: 'm2' }), msg({ id: 'm1' })])

    const returned = await useChatStore.getState().fetchMessages('c1')

    const s = useChatStore.getState()
    expect(s.messages.c1.map((m) => m.id)).toEqual(['m1', 'm2', 'temp_1'])
    expect(s.conversations.find((c) => c.id === 'c1')?.unread_count).toBe(0)
    expect(s.unread).toBe(1) // c2 untouched
    // The RAW wire order is returned, not the reversed copy the store keeps —
    // the screen pages on it and would ask for the wrong cursor otherwise.
    expect(returned.map((m) => m.id)).toEqual(['m2', 'm1'])
  })

  test('a before_id page PREPENDS older messages and leaves unread alone', async () => {
    useChatStore.setState({
      conversations: [conv({ id: 'c1', unread_count: 3 })],
      unread:        3,
      messages:      { c1: [msg({ id: 'm3' })] },
    })
    mockMessages.mockResolvedValue([msg({ id: 'm2' }), msg({ id: 'm1' })])

    await useChatStore.getState().fetchMessages('c1', 'm3')

    expect(mockMessages).toHaveBeenCalledWith({ id: 'c1' }, { before_id: 'm3' })
    const s = useChatStore.getState()
    expect(s.messages.c1.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
    // Paging backwards is not reading: the badge must survive it.
    expect(s.unread).toBe(3)
  })

  test('a first page with no cursor asks for no query at all', async () => {
    mockMessages.mockResolvedValue([])
    await useChatStore.getState().fetchMessages('c1')
    expect(mockMessages).toHaveBeenCalledWith({ id: 'c1' }, undefined)
  })
})

describe('receiveMessage (WS delivery)', () => {
  test('dedupes by id and moves the conversation preview forward', () => {
    useChatStore.setState({ conversations: [conv({ id: 'c1' })] })
    const incoming = msg({ id: 'ws-1', content: 'new text', created_at: '2026-08-20T09:00:00.000Z' })

    useChatStore.getState().receiveMessage('c1', incoming)
    useChatStore.getState().receiveMessage('c1', incoming)

    const s = useChatStore.getState()
    expect(s.messages.c1).toHaveLength(1)
    expect(s.conversations[0].last_message).toBe('new text')
    expect(s.conversations[0].last_message_at).toBe('2026-08-20T09:00:00.000Z')
  })

  test('an attachment-only echo previews as the placeholder, and my own echo reads as sent', () => {
    useChatStore.setState({ conversations: [conv({ id: 'c1' })] })
    useChatStore.getState().receiveMessage('c1', msg({ id: 'ws-2', sender_id: 'me', content: '' }))
    const s = useChatStore.getState()
    expect(s.conversations[0].last_message).toBe(ATTACHMENT_PREVIEW)
    expect(s.messages.c1[0]._status).toBe('sent')
  })

  test('a message for another thread lands there and moves no other preview', () => {
    useChatStore.setState({
      conversations: [conv({ id: 'c1', last_message: 'mine' }), conv({ id: 'c2', last_message: 'theirs' })],
      messages:      { c1: [msg({ id: 'm1' })] },
    })

    useChatStore.getState().receiveMessage('c2', msg({ id: 'ws-3', conversation_id: 'c2', content: 'over here' }))

    const s = useChatStore.getState()
    expect(s.messages.c1.map((m) => m.id)).toEqual(['m1'])
    expect(s.messages.c2.map((m) => m.id)).toEqual(['ws-3'])
    expect(s.conversations.find((c) => c.id === 'c1')?.last_message).toBe('mine')
    expect(s.conversations.find((c) => c.id === 'c2')?.last_message).toBe('over here')
  })
})
