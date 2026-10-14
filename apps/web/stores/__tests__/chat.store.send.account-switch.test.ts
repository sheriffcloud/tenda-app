/**
 * A SEND already in flight when the account changed (#93).
 *
 * `account-switch.inflight.test.ts` is the home of this shape and says so —
 * "one case per WRITER, not one per store". `sendMessage` is chat.store's
 * fourth writer and the last to take a generation snapshot; its cases live here
 * only because that file sits at 294 of a 300-line limit, and shaving its prose
 * to fit them would cost the reasoning that makes it readable.
 *
 * WHAT THE GUARD IS AND IS NOT. It closes no leak: after a logout the thread is
 * already reset, nothing matches the `temp_…` id, and both writes put an empty
 * array back — `chat.store.send.test.ts` pins that from the other side with its
 * two "after the thread was cleared" cases, which use `reset()` directly and so
 * never bump the generation. What the guard removes is the RESIDUE: without it
 * an abandoned send re-creates the previous account's conversation key, empty,
 * in the new account's store. That key is the only thing these cases can see,
 * which is why they assert the shape of `messages` rather than its contents.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

const { convSend } = vi.hoisted(() => ({ convSend: vi.fn() }))

vi.mock('@/api/client', () => ({
  api: {
    auth: { verify: vi.fn(), me: vi.fn(), methods: vi.fn() },
    users: { updateMe: vi.fn(), me: vi.fn() },
    conversations: { sendMessage: (...a: unknown[]) => convSend(...a) },
  },
}))
vi.mock('@/wallet/auth', () => ({ signInWithWallet: vi.fn(), linkWalletWith: vi.fn() }))
vi.mock('@/wallet/adapters/reown', () => ({ reownAdapter: { disconnect: vi.fn(async () => {}) } }))

import { useAuthStore } from '@/stores/auth.store'
import { useChatStore } from '@/stores/chat.store'
import { deferred } from '../../test/deferred'
import { makeMessage } from '../../test/factories/chat'
import type { Message } from '@tenda/shared'

beforeEach(() => {
  useChatStore.getState().reset()
  vi.clearAllMocks()
})

describe('a send in flight across an account switch', () => {
  it('does not re-create the previous account thread when it RESOLVES', async () => {
    const gate = deferred<Message>()
    convSend.mockReturnValue(gate.promise)
    const inFlight = useChatStore.getState().sendMessage('conv-old', 'hi')

    await useAuthStore.getState().logout()
    // A REAL wire row from the factory, not an ad-hoc literal: the swap reads
    // `sent.id` and spreads the whole row into the thread, so a partial fixture
    // would be a message the server cannot send.
    gate.resolve(makeMessage({ id: 'srv-1', conversation_id: 'conv-old', content: 'hi' }))
    await inFlight

    // The whole record rather than `messages['conv-old']`. Reading that one key
    // WOULD discriminate — guarded it is undefined, unguarded it is `[]` — but
    // it would only ever speak for the key the test already thought of. The
    // record says the store gained nothing at all, which is the actual claim.
    expect(useChatStore.getState().messages).toEqual({})
  })

  it('does not re-create it when the send REJECTS either', async () => {
    // The failure mark is a write too, and it is the arm most easily left
    // unguarded — mobile guards both, and this is the half a partial fix
    // would miss.
    const gate = deferred<Message>()
    convSend.mockReturnValue(gate.promise)
    const inFlight = useChatStore.getState().sendMessage('conv-old', 'hi')

    await useAuthStore.getState().logout()
    gate.reject(new Error('the abandoned session died'))
    await inFlight

    expect(useChatStore.getState().messages).toEqual({})
  })

  it('still marks a failure in the SAME session — the guard is not a mute', async () => {
    // The other half, and the reason the guard cannot simply drop every late
    // write: a live send that fails must still offer Retry. Without this a
    // guard that returned unconditionally would pass both cases above while
    // breaking the feature they are protecting.
    convSend.mockRejectedValue(new Error('offline'))

    await useChatStore.getState().sendMessage('conv-1', 'hi')

    const rows = useChatStore.getState().messages['conv-1']
    expect(rows).toHaveLength(1)
    expect(rows[0]._status).toBe('failed')
  })
})
