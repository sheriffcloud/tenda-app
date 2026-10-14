/**
 * The inbox half of the chat store: the conversations list, paging, and WS
 * delivery into an existing thread.
 *
 * Split from the SEND half (chat.store.send.test.ts) when #72's cases took the
 * one file past the house limit — the same split mobile made in #59, and for
 * the same two reasons: the size, and that this half is three independent reads
 * while that half is one state machine.
 *
 * The api client is mocked at its seam; assertions pin the exact wire bodies
 * (drift here breaks mobile parity silently).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_PREVIEW,
  type Conversation,
  type Message,
  type SendMessageInput,
} from '@tenda/shared'

const conversationsApi = vi.hoisted(() => ({
  list: vi.fn<() => Promise<Conversation[]>>(),
  findOrCreate: vi.fn<(body: { user_id: string }) => Promise<Conversation>>(),
  messages: vi.fn<(p: { id: string }, q?: { before_id: string }) => Promise<Message[]>>(),
  sendMessage: vi.fn<(p: { id: string }, body: SendMessageInput) => Promise<Message>>(),
  close: vi.fn(),
}))

vi.mock('@/api/client', () => ({ api: { conversations: conversationsApi } }))

import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { makeUser } from '../../test/factories/user'
import { makeConversation as conv, makeMessage as msg } from '../../test/factories/chat'

beforeEach(() => {
  vi.clearAllMocks()
  // The store's OWN reset, not a hand-listed subset: the old three-field
  // version left `conversationsStatus` to leak between cases, which stayed
  // invisible only while every fetch overwrote it unconditionally.
  useChatStore.getState().reset()
  useAuthStore.setState({ user: makeUser({ id: 'me' }) })
})

describe('conversations', () => {
  it('fetchConversations stores the list and sums unread across threads', async () => {
    conversationsApi.list.mockResolvedValue([
      conv({ id: 'c1', unread_count: 2 }),
      conv({ id: 'c2', unread_count: 3 }),
    ])
    await useChatStore.getState().fetchConversations()
    expect(useChatStore.getState().unread).toBe(5)
  })

  it('findOrCreate prepends a NEW conversation and replaces a known one in place', async () => {
    conversationsApi.findOrCreate.mockResolvedValue(conv({ id: 'c9' }))
    await useChatStore.getState().findOrCreate('them')
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual(['c9'])

    conversationsApi.findOrCreate.mockResolvedValue(conv({ id: 'c9', last_message: 'reopened' }))
    await useChatStore.getState().findOrCreate('them')
    const list = useChatStore.getState().conversations
    expect(list).toHaveLength(1)
    expect(list[0].last_message).toBe('reopened')
  })

  it('findOrCreate replaces its own row and leaves every other thread untouched', async () => {
    // The replace arm maps over the WHOLE list, so the branch that matters is
    // the one returning every OTHER conversation unchanged (#73). Reopening one
    // thread must not rewrite the inbox around it. Mobile pins the same arm.
    useChatStore.setState({
      conversations: [conv({ id: 'c1', last_message: 'first' }), conv({ id: 'c2', last_message: 'second' })],
    })
    conversationsApi.findOrCreate.mockResolvedValue(conv({ id: 'c2', last_message: 'reopened' }))

    await useChatStore.getState().findOrCreate('them')

    const list = useChatStore.getState().conversations
    expect(list.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(list.map((c) => c.last_message)).toEqual(['first', 'reopened'])
  })

  it('closeConversation removes the thread from the inbox', async () => {
    useChatStore.setState({ conversations: [conv({ id: 'c1' }), conv({ id: 'c2' })] })
    conversationsApi.close.mockResolvedValue(conv({ id: 'c1', status: 'closed' }))
    await useChatStore.getState().closeConversation('c1')
    expect(conversationsApi.close).toHaveBeenCalledWith({ id: 'c1' })
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual(['c2'])
  })
})

describe('fetchMessages', () => {
  it('reverses the newest-first wire order, keeps pending optimistic copies, clears unread locally', async () => {
    useChatStore.setState({
      conversations: [conv({ id: 'c1', unread_count: 4 }), conv({ id: 'c2', unread_count: 1 })],
      unread: 5,
      messages: { c1: [{ ...msg({ id: 'temp_1', sender_id: 'me' }), _status: 'sending' }] },
    })
    conversationsApi.messages.mockResolvedValue([msg({ id: 'm2' }), msg({ id: 'm1' })])

    await useChatStore.getState().fetchMessages('c1')

    const s = useChatStore.getState()
    expect(s.messages.c1.map((m) => m.id)).toEqual(['m1', 'm2', 'temp_1'])
    expect(s.conversations.find((c) => c.id === 'c1')?.unread_count).toBe(0)
    expect(s.unread).toBe(1) // c2 untouched
  })

  it('a thread the store holds no array for reads as empty, not as a crash', async () => {
    // The `?? []` in the merge (#73). Opening a conversation the store has
    // never held messages for is the ordinary first-open case, and without the
    // fallback the filter below it runs over `undefined` (measured: "Cannot
    // read properties of undefined (reading 'filter')").
    useChatStore.setState({ conversations: [conv({ id: 'c1' })], messages: {} })
    conversationsApi.messages.mockResolvedValue([msg({ id: 'm1' })])

    await useChatStore.getState().fetchMessages('c1')

    expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual(['m1'])
  })

  it('a before_id page PREPENDS older messages without touching unread', async () => {
    useChatStore.setState({ messages: { c1: [msg({ id: 'm3' })] } })
    conversationsApi.messages.mockResolvedValue([msg({ id: 'm2' }), msg({ id: 'm1' })])
    await useChatStore.getState().fetchMessages('c1', 'm3')
    expect(conversationsApi.messages).toHaveBeenCalledWith({ id: 'c1' }, { before_id: 'm3' })
    expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
  })
})

describe('receiveMessage (WS delivery)', () => {
  it('dedupes by id and updates the conversation preview', () => {
    useChatStore.setState({ conversations: [conv({ id: 'c1' })] })
    const incoming = msg({ id: 'ws-1', content: 'new text', created_at: '2026-08-16T09:00:00.000Z' })
    useChatStore.getState().receiveMessage('c1', incoming)
    useChatStore.getState().receiveMessage('c1', incoming)
    const s = useChatStore.getState()
    expect(s.messages.c1).toHaveLength(1)
    expect(s.conversations[0].last_message).toBe('new text')
    expect(s.conversations[0].last_message_at).toBe('2026-08-16T09:00:00.000Z')
  })

  it('moves ONLY the delivered thread — every other row keeps its own preview', () => {
    // The `: c` arm of receiveMessage's conversations map was the file's one
    // uncovered line: every other case here seeds a single conversation
    // whose id IS the delivery target, so the arm protecting the rest of the
    // inbox had never run. What it guards is rendered directly — the preview
    // line on every row of the inbox column.
    useChatStore.setState({
      conversations: [
        conv({ id: 'c1', last_message: 'older thread', last_message_at: '2026-08-14T08:00:00.000Z' }),
        conv({ id: 'c2', last_message: 'stale preview', last_message_at: '2026-08-14T09:00:00.000Z' }),
      ],
      messages: { c1: [msg({ id: 'm-a' })] },
    })

    useChatStore.getState().receiveMessage('c2', msg({
      id: 'ws-cross',
      conversation_id: 'c2',
      content: 'over here',
      created_at: '2026-08-16T11:00:00.000Z',
    }))

    const s = useChatStore.getState()
    // The target moved — asserted in the same case so this cannot pass by the
    // store doing nothing at all.
    const target = s.conversations.find((c) => c.id === 'c2')
    expect(target?.last_message).toBe('over here')
    expect(target?.last_message_at).toBe('2026-08-16T11:00:00.000Z')
    // And the bystander did not.
    const bystander = s.conversations.find((c) => c.id === 'c1')
    expect(bystander?.last_message).toBe('older thread')
    expect(bystander?.last_message_at).toBe('2026-08-14T08:00:00.000Z')
    // The message itself landed in c2's thread only.
    expect(s.messages.c1.map((m) => m.id)).toEqual(['m-a'])
    expect(s.messages.c2.map((m) => m.id)).toEqual(['ws-cross'])
  })

  it('an attachment-only echo previews as the attachment placeholder and my own echo reads as sent', () => {
    useChatStore.setState({ conversations: [conv({ id: 'c1' })] })
    useChatStore.getState().receiveMessage('c1', msg({ id: 'ws-2', sender_id: 'me', content: '' }))
    const s = useChatStore.getState()
    expect(s.conversations[0].last_message).toBe(ATTACHMENT_PREVIEW)
    expect(s.messages.c1[0]._status).toBe('sent')
  })
})
