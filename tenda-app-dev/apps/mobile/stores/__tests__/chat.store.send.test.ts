/**
 * The send half of the chat store: optimistic copy, temp-id swap, the WS-echo
 * race, retry, and what happens when the swap itself fails (#59, #72).
 *
 * WS DELIVERY is no longer here — `receiveMessage` moved to the inbox half in
 * #72, matching how web has always split the two and bringing this file back
 * under the house limit.
 *
 * Split from chat.store.test.ts, which covers the inbox and paging, because
 * together they run past the house limit — and because this half is one state
 * machine while that half is three independent reads.
 *
 * The race is the reason this file exists. `sendMessage` appends a `temp_…`
 * copy, POSTs, and then replaces that copy with the server row — but the
 * server also broadcasts the message back over the socket, and the broadcast
 * can arrive first. Both orders have to end with exactly one message.
 */
const mockSendMessage = jest.fn()

// Typed at the seam for the documentation value — see the note in
// chat.store.test.ts: neither the matcher below nor jest.mock's factory is
// actually type-checked against the route, which was measured rather than
// assumed.
jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: {
    conversations: {
      sendMessage: (params: { id: string }, body: SendMessageInput) => mockSendMessage(params, body),
    },
  },
}))

import { waitFor } from '@testing-library/react-native'
import { ATTACHMENT_PREVIEW, type Message, type SendMessageInput, type User } from '@tenda/shared'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { conversation as conv, message as msg, resetChatStore } from '../__fixtures__/chat'

beforeEach(() => {
  resetChatStore()
  // Narrowed to User, not cast to `never`: the store reads `user?.id` and
  // nothing else, and this way a fixture that got the id's TYPE wrong still
  // fails to compile.
  useAuthStore.setState({ user: { id: 'me' } as User })
})

describe('sendMessage lifecycle', () => {
  test('appends an optimistic copy, then swaps in the server row, with the exact wire body', async () => {
    mockSendMessage.mockResolvedValue(msg({ id: 'srv-1', sender_id: 'me', content: 'yo' }))

    await useChatStore.getState().sendMessage('c1', 'yo', { escrowId: 'e1', kind: 'gig' }, {
      url:  'https://res.cloudinary.com/demo/image/upload/v1/chat/a.png',
      type: 'image',
      size: 2048,
    })

    expect(mockSendMessage).toHaveBeenCalledWith(
      { id: 'c1' },
      {
        content:         'yo',
        escrow_id:       'e1',
        attachment_url:  'https://res.cloudinary.com/demo/image/upload/v1/chat/a.png',
        attachment_type: 'image',
        attachment_size: 2048,
      },
    )
    const msgs = useChatStore.getState().messages.c1
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ id: 'srv-1', _status: 'sent' })
  })

  test('omits the attachment fields entirely when sending text only', async () => {
    mockSendMessage.mockResolvedValue(msg({ id: 'srv-2', sender_id: 'me' }))
    await useChatStore.getState().sendMessage('c1', 'plain')
    // The exact key set: the server rejects a partial attachment triple, so
    // three absent keys and three `undefined` ones are not the same request.
    const [, body] = mockSendMessage.mock.lastCall ?? []
    expect(Object.keys(body ?? {}).sort()).toEqual(['content', 'escrow_id'])
  })

  test('a signed-out sender still gets an optimistic copy, with an empty sender id', async () => {
    // `user?.id ?? ''` — the screen is unreachable signed out, but the store
    // must not throw its way through a session that expired mid-compose.
    useAuthStore.setState({ user: null })
    mockSendMessage.mockResolvedValue(msg({ id: 'srv-3', sender_id: '' }))
    await useChatStore.getState().sendMessage('c1', 'orphan')
    expect(useChatStore.getState().messages.c1).toHaveLength(1)
  })

  test('drops the temp copy when the WS echo of the same message landed first', async () => {
    let resolveSend: ((m: Message) => void) | undefined
    mockSendMessage.mockReturnValue(new Promise<Message>((resolve) => { resolveSend = resolve }))
    const echoed = msg({ id: 'srv-4', sender_id: 'me', content: 'raced' })

    const pending = useChatStore.getState().sendMessage('c1', 'raced')
    expect(useChatStore.getState().messages.c1).toHaveLength(1) // the temp copy

    useChatStore.getState().receiveMessage('c1', echoed)
    resolveSend?.(echoed)
    await pending

    // Not two copies of the same message, and not zero: the temp one goes and
    // the echo stays.
    expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual(['srv-4'])
  })

  test('the temp-to-server swap leaves the messages already in the thread alone', async () => {
    useChatStore.setState({ messages: { c1: [msg({ id: 'older' })] } })
    mockSendMessage.mockResolvedValue(msg({ id: 'srv-8', sender_id: 'me', content: 'newest' }))

    await useChatStore.getState().sendMessage('c1', 'newest')

    expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual(['older', 'srv-8'])
  })

  test('a failed send marks its own copy and no other message in the thread', async () => {
    useChatStore.setState({ messages: { c1: [msg({ id: 'older' })] } })
    mockSendMessage.mockRejectedValueOnce(new Error('offline'))

    await useChatStore.getState().sendMessage('c1', 'doomed')

    const msgs = useChatStore.getState().messages.c1
    expect(msgs.map((m) => m.id)).toEqual(['older', expect.stringMatching(/^temp_/)])
    expect(msgs[0]._status).toBeUndefined()
    expect(msgs[1]._status).toBe('failed')
  })

  test('marks the optimistic copy failed when the POST rejects, and retry re-sends it', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('offline'))
    await useChatStore.getState().sendMessage('c1', 'oops', { escrowId: 'e1', kind: 'gig' })
    const failed = useChatStore.getState().messages.c1[0]
    expect(failed._status).toBe('failed')

    mockSendMessage.mockResolvedValue(msg({ id: 'srv-5', sender_id: 'me', content: 'oops' }))
    useChatStore.getState().retryMessage('c1', failed)

    await waitFor(() => {
      expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual(['srv-5'])
    })
    // The escrow context survived the round trip through the failed row.
    expect(mockSendMessage).toHaveBeenLastCalledWith(
      { id: 'c1' },
      expect.objectContaining({ content: 'oops', escrow_id: 'e1' }),
    )
  })

  test('retry re-sends an already-uploaded attachment, url/type/size intact', async () => {
    // The only place in the app that rebuilds an UploadedAttachment from the
    // three wire columns rather than from a fresh upload. #53 found web's copy
    // of this promised by a docstring and reached by no test; a regression
    // drops the reader's image and re-sends the text alone.
    mockSendMessage.mockRejectedValueOnce(new Error('offline'))
    await useChatStore.getState().sendMessage('c1', 'see this', undefined, {
      url:  'https://res.cloudinary.com/demo/image/upload/v1/chat/b.png',
      type: 'image',
      size: 4096,
    })
    const failed = useChatStore.getState().messages.c1[0]
    expect(failed._status).toBe('failed')

    mockSendMessage.mockResolvedValue(msg({ id: 'srv-6', sender_id: 'me', content: 'see this' }))
    useChatStore.getState().retryMessage('c1', failed)

    await waitFor(() => {
      expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual(['srv-6'])
    })
    expect(mockSendMessage).toHaveBeenLastCalledWith(
      { id: 'c1' },
      expect.objectContaining({
        attachment_url:  'https://res.cloudinary.com/demo/image/upload/v1/chat/b.png',
        attachment_type: 'image',
        attachment_size: 4096,
      }),
    )
  })

  test('retry sends NO attachment when the columns are only partly set', async () => {
    // The three are nullable AS A GROUP. A row carrying a url but no size is
    // not half an attachment to re-send — it is a body the server refuses, so
    // the retry has to go out as plain text rather than assembling something
    // from whatever happens to be present.
    const partial = {
      ...msg({ id: 'temp_1', sender_id: 'me', content: 'partial' }),
      attachment_url:  'https://res.cloudinary.com/demo/image/upload/v1/chat/c.png',
      attachment_type: 'image' as const,
      attachment_size: null,
      _status:         'failed' as const,
    }
    useChatStore.setState({ messages: { c1: [partial] } })
    mockSendMessage.mockResolvedValue(msg({ id: 'srv-7', sender_id: 'me', content: 'partial' }))

    useChatStore.getState().retryMessage('c1', partial)

    await waitFor(() => {
      expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual(['srv-7'])
    })
    const [, body] = mockSendMessage.mock.lastCall ?? []
    expect(Object.keys(body ?? {}).sort()).toEqual(['content', 'escrow_id'])
  })

  test('retrying a message in a thread that was never loaded does not throw', async () => {
    // `messages[conversationId] ?? []` — retry can be reached from a thread
    // the store holds no array for, and the filter would throw on undefined.
    const failed = { ...msg({ id: 'temp_9', sender_id: 'me', content: 'orphan' }), _status: 'failed' as const }
    mockSendMessage.mockResolvedValue(msg({ id: 'srv-9', sender_id: 'me', content: 'orphan' }))

    useChatStore.getState().retryMessage('never-loaded', failed)

    await waitFor(() => {
      expect(useChatStore.getState().messages['never-loaded'].map((m) => m.id)).toEqual(['srv-9'])
    })
  })

  test('a send that resolves after the thread was cleared does not put the message back', async () => {
    // The store being emptied mid-flight is not hypothetical — it is what a
    // sign-out does. Emptying it directly is deliberately NOT an account
    // switch: the generation #65 added does not move, so the guard above the
    // swap stays open and the swap really runs — which is what lets this case
    // reach the fallback below. The switch itself is pinned next door in
    // chat.store.account-switch.test.ts. What must hold either way is that the
    // reply to a dead session's POST does not reinstate the message.
    //
    // It DOES now prove the `?? []` that keeps the handler from throwing on the
    // missing thread. It did not when this case was written: sendMessage's
    // catch was wide enough to swallow an error from its own success handler,
    // so removing that guard left every assertion here green. #72 narrowed the
    // catch to the request, and removing the guard now fails this case
    // (measured in #72's sweep).
    let resolveSend: ((m: Message) => void) | undefined
    mockSendMessage.mockReturnValue(new Promise<Message>((resolve) => { resolveSend = resolve }))

    const pending = useChatStore.getState().sendMessage('c1', 'in flight')
    useChatStore.setState({ messages: {} })
    resolveSend?.(msg({ id: 'srv-10', sender_id: 'me', content: 'in flight' }))
    await pending

    expect(useChatStore.getState().messages.c1).toEqual([])
  })

  test('a send that REJECTS after the thread was cleared leaves nothing behind either', async () => {
    let rejectSend: ((e: Error) => void) | undefined
    mockSendMessage.mockReturnValue(new Promise<Message>((_, reject) => { rejectSend = reject }))

    const pending = useChatStore.getState().sendMessage('c1', 'in flight')
    useChatStore.setState({ messages: {} })
    rejectSend?.(new Error('offline'))
    await pending

    expect(useChatStore.getState().messages.c1).toEqual([])
  })
})

test('a send whose STORE UPDATE fails is not reported as a failed send (#72)', async () => {
  // The bug this pins: the try used to wrap the swap as well as the request, so
  // anything the swap threw landed in the failure handler. The message was on
  // the server, the thread showed it failed, and the Retry beside it sent a
  // SECOND copy — a silent duplicate reported as a network error.
  //
  // The lever is a 200 whose body is not a message. Nothing validates the
  // response, so `sent.id` inside the swap throws on it — which is the shape a
  // proxy or a misbehaving handler produces, not a contrived one.
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  mockSendMessage.mockResolvedValue(null)

  await useChatStore.getState().sendMessage('c1', 'hi')

  const sent = useChatStore.getState().messages.c1
  expect(sent).toHaveLength(1)
  // NOT 'failed' — that is the whole point. A failed row offers Retry, and the
  // server already has this message.
  expect(sent?.[0]._status).toBe('sending')
  expect(warn).toHaveBeenCalled()
  warn.mockRestore()
})

test('and it still does not reject — every caller is `void sendMessage(...)`', async () => {
  // Narrowing the catch could have let the swap's throw escape instead. All
  // three call sites fire and forget, so an escaping rejection would surface as
  // an unhandled one rather than reaching anybody who could act on it.
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  mockSendMessage.mockResolvedValue(null)

  await expect(useChatStore.getState().sendMessage('c1', 'hi')).resolves.toBeUndefined()

  warn.mockRestore()
})
