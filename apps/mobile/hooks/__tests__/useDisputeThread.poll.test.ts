/**
 * useDisputeThread — the load/tail-poll lifecycle: cursor handling, the
 * back-off after quiet polls, context retention, and error surfacing.
 *
 * The cursor rule is the load-bearing one and has a real bug behind it: only
 * SERVER batches may advance it. Advancing from our own `send()` would skip a
 * counterparty message timestamped between the last poll and that send — it
 * would sort before the cursor and never be fetched again.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { DisputeMessage, DisputeThreadResponse } from '@tenda/shared'

const mockGetThread = jest.fn()
const mockSend = jest.fn()
jest.mock('@/api/client', () => {
  const { ApiClientError } = require('@/api/request')
  return {
    ApiClientError,
    api: {
      escrows: {
        disputeThread: (...a: unknown[]) => mockGetThread(...a),
        sendDisputeMessage: (...a: unknown[]) => mockSend(...a),
      },
    },
  }
})

import { useDisputeThread } from '@/hooks/useDisputeThread'

const POLL_INTERVAL_MS = 4_000
const POLL_IDLE_MS = 10_000

function msg(id: string, created_at: string): DisputeMessage {
  return {
    id,
    dispute_id: 'd1',
    sender_id: 'u1',
    body: id,
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at,
  }
}

const context: DisputeThreadResponse['context'] = {
  kind: 'gig',
  status: 'disputed',
  chain_id: 'solana:devnet',
  asset: 'USDC',
  amount_raw: '1000000',
  subject_title: 'Fix my sink',
  parties: [],
  reason: 'not delivered',
  raised_at: '2026-07-01T09:00:00.000Z',
  winner: null,
  resolved_at: null,
}

function response(over: Partial<DisputeThreadResponse> = {}): DisputeThreadResponse {
  return {
    dispute_id: 'd1',
    escrow_id: 'e1',
    assigned_to_id: null,
    read_only: false,
    context,
    messages: [],
    reads: [],
    ...over,
  }
}

/** The `{ after }` argument of the Nth disputeThread call, if any. */
const cursorOfCall = (n: number): string | undefined =>
  (mockGetThread.mock.calls[n]?.[1] as { after?: string } | undefined)?.after

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})
afterEach(() => {
  jest.useRealTimers()
})

async function mounted() {
  const view = renderHook(() => useDisputeThread('e1'))
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

/** Advance past one scheduled poll and let its promise settle. */
async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

test('the first load fetches WITHOUT a cursor and publishes thread + messages', async () => {
  mockGetThread.mockResolvedValue(response({ messages: [msg('m1', '2026-07-01T10:00:00.000Z')] }))
  const view = await mounted()

  expect(cursorOfCall(0)).toBeUndefined()
  expect(view.result.current.thread?.dispute_id).toBe('d1')
  expect(view.result.current.messages.map((m) => m.id)).toEqual(['m1'])
  expect(view.result.current.error).toBeNull()
})

test('a tail poll sends the newest SERVER timestamp as the cursor', async () => {
  mockGetThread
    .mockResolvedValueOnce(response({ messages: [msg('m1', '2026-07-01T10:00:00.000Z')] }))
    .mockResolvedValue(response({ context: null, messages: [msg('m2', '2026-07-01T11:00:00.000Z')] }))
  const view = await mounted()

  await tick(POLL_INTERVAL_MS)
  expect(cursorOfCall(1)).toBe('2026-07-01T10:00:00.000Z')
  expect(view.result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
})

test('OUR OWN send does not advance the cursor', async () => {
  // The documented rule. If send() advanced it, a counterparty message
  // timestamped between the last poll and our send would sort before the
  // cursor and never be fetched again.
  mockGetThread.mockResolvedValue(response({ messages: [msg('m1', '2026-07-01T10:00:00.000Z')] }))
  mockSend.mockResolvedValue(msg('mine', '2026-07-01T12:00:00.000Z'))
  const view = await mounted()

  await act(async () => {
    await view.result.current.send('hello')
  })
  await tick(POLL_INTERVAL_MS)

  expect(cursorOfCall(1)).toBe('2026-07-01T10:00:00.000Z')
  expect(cursorOfCall(1)).not.toBe('2026-07-01T12:00:00.000Z')
})

test('the poll backs off: the active cadence stops firing, the idle one resumes it', () => {
  // Asserted as a PROPERTY rather than per-tick call counts: the reschedule
  // runs in the poll's promise continuation, so exactly which virtual tick a
  // given request lands on is not stable. What must hold is that quiet polls
  // eventually stop responding to the 4s cadence, and that the 10s one still
  // wakes them.
  return (async () => {
    mockGetThread
      .mockResolvedValueOnce(response({ messages: [msg('m1', '2026-07-01T10:00:00.000Z')] }))
      .mockResolvedValue(response({ context: null, messages: [] }))
    await mounted()

    const MAX_ACTIVE_TICKS = 6
    let ticks = 0
    let seen = mockGetThread.mock.calls.length
    while (ticks < MAX_ACTIVE_TICKS) {
      await tick(POLL_INTERVAL_MS)
      const now = mockGetThread.mock.calls.length
      if (now === seen) break // the active cadence no longer fires ⇒ backed off
      seen = now
      ticks += 1
    }
    // Without the back-off the 4s cadence would fire every single time.
    expect(ticks).toBeLessThan(MAX_ACTIVE_TICKS)

    const stalled = mockGetThread.mock.calls.length
    await tick(POLL_IDLE_MS)
    expect(mockGetThread.mock.calls.length).toBeGreaterThan(stalled)
  })()
})

test('a context-less tail poll keeps the context from the full load', async () => {
  // Otherwise the party list — which drives the seat, the bubbles and the
  // header — would blank out every few seconds.
  mockGetThread
    .mockResolvedValueOnce(response({ messages: [msg('m1', '2026-07-01T10:00:00.000Z')] }))
    .mockResolvedValue(response({ context: null, messages: [] }))
  const view = await mounted()
  expect(view.result.current.thread?.context).not.toBeNull()

  await tick(POLL_INTERVAL_MS)
  expect(view.result.current.thread?.context?.subject_title).toBe('Fix my sink')
})

test('a failed first load surfaces the message; a failed POLL stays silent', async () => {
  mockGetThread.mockRejectedValueOnce(new Error('offline'))
  const view = await mounted()
  expect(view.result.current.error).toBe('offline')

  // Recover, then let a later poll fail: the thread on screen must not be
  // replaced by an error because one tail request blipped.
  mockGetThread.mockResolvedValueOnce(response({ messages: [msg('m1', '2026-07-01T10:00:00.000Z')] }))
  await act(async () => {
    await view.result.current.reload()
  })
  expect(view.result.current.error).toBeNull()

  mockGetThread.mockRejectedValue(new Error('blip'))
  await tick(POLL_INTERVAL_MS)
  expect(view.result.current.error).toBeNull()
  expect(view.result.current.messages).toHaveLength(1)
})

test('a non-Error load failure still yields readable copy', async () => {
  mockGetThread.mockRejectedValue('kaboom')
  const view = await mounted()
  expect(view.result.current.error).toBe('Could not load the dispute thread')
})

test('with no escrow id nothing is fetched and send reports a failure', async () => {
  const view = renderHook(() => useDisputeThread(null))

  let outcome: string | undefined
  await act(async () => {
    outcome = await view.result.current.send('hello')
  })
  expect(outcome).toBe('failed')
  expect(mockGetThread).not.toHaveBeenCalled()
})
