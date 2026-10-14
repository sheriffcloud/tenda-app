/**
 * chat.store — the SETTLED-INBOX guards (#26), split from chat.store.test.ts
 * at #53 when that file crossed 300 lines.
 *
 * Its own file because it is its own question: not "does sending work" but
 * "what does the column show while a background refresh is in flight". The
 * rule — a settled inbox keeps its answer, only an unsettled one moves — is
 * the same one notifications.store follows since #48 and chain-registry.store
 * followed first. The api client is mocked at its seam, as next door.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation } from '@tenda/shared'

// `list` alone. The split carried over the whole five-method mock, both chat
// factories and ATTACHMENT_PREVIEW from the file these cases left — none of
// which any case here calls. Dead setup in a test file is worse than dead code
// in a source one: it reads as though the file exercises sending, closing and
// attachments, and nothing (noUnusedLocals is off) says otherwise.
const conversationsApi = vi.hoisted(() => ({
  list: vi.fn<() => Promise<Conversation[]>>(),
}))

vi.mock('@/api/client', () => ({ api: { conversations: conversationsApi } }))

import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { makeUser } from '../../test/factories/user'

beforeEach(() => {
  vi.clearAllMocks()
  // The store's OWN reset, not a hand-listed subset: the old three-field
  // version left `conversationsStatus` to leak between cases, which stayed
  // invisible only while every fetch overwrote it unconditionally.
  useChatStore.getState().reset()
  useAuthStore.setState({ user: makeUser({ id: 'me' }) })
})

describe('the fallback poll over a settled inbox (#26)', () => {
  it('does not re-raise the skeleton on an inbox that is legitimately EMPTY', async () => {
    // The column shows a skeleton when the status is 'loading' AND it has no
    // rows — a guard that works for a populated list and fails for an empty
    // one, which is the commonest new account. With the socket down the
    // fallback poll runs every 15s, so an account with no messages watched its
    // "No messages yet" flip to a skeleton and back, for as long as it stayed
    // on the surface. chain-registry.store already had the rule ("never flash
    // a skeleton over a registry already serving good data"); the inbox did
    // not.
    conversationsApi.list.mockResolvedValue([])
    await useChatStore.getState().fetchConversations()
    expect(useChatStore.getState().conversationsStatus).toBe('ready')

    let release!: (rows: Conversation[]) => void
    conversationsApi.list.mockReturnValue(new Promise((r) => { release = r }))
    const polling = useChatStore.getState().fetchConversations()

    expect(useChatStore.getState().conversationsStatus).toBe('ready')

    release([])
    await polling
  })

  it('a failed poll does not turn a SETTLED empty inbox into an error', async () => {
    // Same doctrine as the skeleton above, and the column states it outright:
    // "a failed poll behind a populated list is not worth taking the list
    // away". Once the inbox has answered "none", one transient poll failure
    // must not replace that true statement with "Could not load your
    // messages" — the column shows the error whenever the status is 'error'
    // and it holds no rows, which a genuinely empty inbox always does.
    conversationsApi.list.mockResolvedValue([])
    await useChatStore.getState().fetchConversations()
    expect(useChatStore.getState().conversationsStatus).toBe('ready')

    conversationsApi.list.mockRejectedValue(new Error('poll failed'))
    await expect(useChatStore.getState().fetchConversations()).rejects.toThrow()

    expect(useChatStore.getState().conversationsStatus).toBe('ready')
  })

  it('a first load that FAILS is still an error — there is nothing settled to keep', async () => {
    conversationsApi.list.mockRejectedValue(new Error('down'))
    await expect(useChatStore.getState().fetchConversations()).rejects.toThrow()
    expect(useChatStore.getState().conversationsStatus).toBe('error')
  })

  it('DOES raise it on the first load, when there is nothing to show yet', async () => {
    // The other half: a first load with no data must still show the skeleton,
    // or the surface renders its empty state before anyone has asked.
    let release!: (rows: Conversation[]) => void
    conversationsApi.list.mockReturnValue(new Promise((r) => { release = r }))
    const first = useChatStore.getState().fetchConversations()

    expect(useChatStore.getState().conversationsStatus).toBe('loading')

    release([])
    await first
  })

  it('raises it again after an ERROR, so a retry is visible', async () => {
    conversationsApi.list.mockRejectedValue(new Error('down'))
    await expect(useChatStore.getState().fetchConversations()).rejects.toThrow()
    expect(useChatStore.getState().conversationsStatus).toBe('error')

    let release!: (rows: Conversation[]) => void
    conversationsApi.list.mockReturnValue(new Promise((r) => { release = r }))
    const retry = useChatStore.getState().fetchConversations()

    expect(useChatStore.getState().conversationsStatus).toBe('loading')

    release([])
    await retry
  })
})
