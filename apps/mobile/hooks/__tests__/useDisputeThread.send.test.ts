/**
 * useDisputeThread.send — reporting WHY a post was refused, and freezing a
 * thread the server has already closed.
 *
 * `send` used to return a bare boolean from a `catch {}`, throwing the reason
 * away, so the screen could only ever say "try again". These tests pin the
 * widened contract and the one state change the hook makes on its own: a
 * DISPUTE_RESOLVED refusal flips read_only locally, so the composer goes away
 * with the toast instead of lingering until the next poll.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { ErrorCode, type DisputeThreadResponse } from '@tenda/shared'

const mockGetThread = jest.fn()
const mockSend = jest.fn()
jest.mock('@/api/client', () => {
  // Required inside the factory: jest hoists this above the imports.
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

import { ApiClientError } from '@/api/request'
import { useDisputeThread } from '@/hooks/useDisputeThread'

const thread: DisputeThreadResponse = {
  dispute_id: 'd1',
  escrow_id: 'e1',
  assigned_to_id: null,
  read_only: false,
  context: null,
  messages: [],
  reads: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetThread.mockResolvedValue(thread)
})

/** Mount and wait for the initial load so `thread` is populated. */
async function mounted() {
  const view = renderHook(() => useDisputeThread('e1'))
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

test('a successful send reports "sent" and appends the message', async () => {
  mockSend.mockResolvedValue({
    id: 'm1',
    dispute_id: 'd1',
    sender_id: 'u1',
    body: 'hello',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at: '2026-07-01T10:00:00.000Z',
  })
  const view = await mounted()

  let outcome: string | undefined
  await act(async () => {
    outcome = await view.result.current.send('hello')
  })
  expect(outcome).toBe('sent')
  expect(view.result.current.messages).toHaveLength(1)
})

test.each([
  [409, ErrorCode.DISPUTE_RESOLVED, 'resolved'],
  [403, ErrorCode.FORBIDDEN, 'not_claimed'],
  [400, ErrorCode.VALIDATION_ERROR, 'invalid'],
  [429, undefined, 'rate_limited'],
  [500, ErrorCode.INTERNAL_ERROR, 'failed'],
])('a %i refusal is reported as %s → %s', async (status, code, expected) => {
  mockSend.mockRejectedValue(new ApiClientError(status, 'Error', 'server copy', code))
  const view = await mounted()

  let outcome: string | undefined
  await act(async () => {
    outcome = await view.result.current.send('hello')
  })
  expect(outcome).toBe(expected)
  // A refused send must never be appended optimistically.
  expect(view.result.current.messages).toHaveLength(0)
})

test('DISPUTE_RESOLVED freezes the thread read-only without waiting for a poll', async () => {
  mockSend.mockRejectedValue(
    new ApiClientError(409, 'Conflict', 'resolved', ErrorCode.DISPUTE_RESOLVED),
  )
  const view = await mounted()
  expect(view.result.current.thread?.read_only).toBe(false)

  await act(async () => {
    await view.result.current.send('hello')
  })
  expect(view.result.current.thread?.read_only).toBe(true)
})

test('any OTHER refusal leaves the thread writable', async () => {
  // Over-reaching here would silently strip the composer on a transient 500.
  mockSend.mockRejectedValue(new ApiClientError(403, 'Forbidden', 'no claim', ErrorCode.FORBIDDEN))
  const view = await mounted()

  await act(async () => {
    await view.result.current.send('hello')
  })
  expect(view.result.current.thread?.read_only).toBe(false)
})

test('a network drop is retryable and changes no state', async () => {
  mockSend.mockRejectedValue(new TypeError('Network request failed'))
  const view = await mounted()

  let outcome: string | undefined
  await act(async () => {
    outcome = await view.result.current.send('hello')
  })
  expect(outcome).toBe('failed')
  expect(view.result.current.thread?.read_only).toBe(false)
})
