/**
 * The mediation-thread tail: context survives context-less tail polls,
 * only SERVER batches advance the poll cursor (a self-send must not skip
 * counterparty messages), sends classify their refusal and a resolved
 * refusal freezes the thread locally.
 */
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiClientError, ErrorCode } from '@tenda/shared'
import type { DisputeMessage, DisputeThreadResponse } from '@tenda/shared'

const escrowsApi = vi.hoisted(() => ({
  disputeThread: vi.fn<(p: { id: string }, q?: { after?: string }) => Promise<DisputeThreadResponse>>(),
  sendDisputeMessage: vi.fn<(p: { id: string }, body: Record<string, unknown>) => Promise<DisputeMessage>>(),
}))

vi.mock('@/api/client', () => ({ api: { escrows: escrowsApi } }))

import { useDisputeThread } from '@/hooks/dispute/useDisputeThread'

function msg(id: string, createdAt: string): DisputeMessage {
  return {
    id,
    dispute_id: 'd1',
    sender_id: 'them',
    body: `m-${id}`,
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at: createdAt,
  }
}

function response(messages: DisputeMessage[], context: DisputeThreadResponse['context']): DisputeThreadResponse {
  return {
    dispute_id: 'd1',
    escrow_id: 'e1',
    read_only: false,
    assigned_to_id: null,
    context,
    messages,
    reads: [],
  }
}

/** Flush pending microtasks (fake timers make waitFor spin forever). */
const flush = () => act(async () => {})

const CONTEXT: DisputeThreadResponse['context'] = {
  kind: 'gig',
  status: 'disputed',
  chain_id: 'solana:devnet',
  asset: 'USDC_SOL',
  amount_raw: '1',
  subject_title: 'Paint',
  parties: [],
  reason: 'not done',
  raised_at: null,
  winner: null,
  resolved_at: null,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

test('loads with context, then a context-less tail poll keeps the first copy', async () => {
  escrowsApi.disputeThread
    .mockResolvedValueOnce(response([msg('m1', '2026-08-15T10:00:00Z')], CONTEXT))
    .mockResolvedValueOnce(response([msg('m2', '2026-08-15T10:01:00Z')], null))

  const { result } = renderHook(() => useDisputeThread('e1'))
  await flush()
  expect(result.current.loading).toBe(false)
  expect(result.current.thread?.context?.subject_title).toBe('Paint')

  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
  expect(result.current.thread?.context?.subject_title).toBe('Paint') // retained
  // The tail asked from the cursor:
  expect(escrowsApi.disputeThread).toHaveBeenLastCalledWith({ id: 'e1' }, { after: '2026-08-15T10:00:00Z' })
})

test('a self-send appends WITHOUT advancing the cursor, so backfill still arrives', async () => {
  escrowsApi.disputeThread.mockResolvedValueOnce(response([msg('m1', '2026-08-15T10:00:00Z')], CONTEXT))
  const { result } = renderHook(() => useDisputeThread('e1'))
  await flush()
  expect(result.current.loading).toBe(false)

  escrowsApi.sendDisputeMessage.mockResolvedValue({ ...msg('mine', '2026-08-15T10:05:00Z'), sender_id: 'me' })
  await act(async () => {
    expect(await result.current.send('hello')).toBe('sent')
  })
  expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'mine'])

  // The next tail still polls from m1's timestamp — a counterparty message
  // timestamped before our send is not skipped.
  escrowsApi.disputeThread.mockResolvedValueOnce(response([msg('m2', '2026-08-15T10:03:00Z')], null))
  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(escrowsApi.disputeThread).toHaveBeenLastCalledWith({ id: 'e1' }, { after: '2026-08-15T10:00:00Z' })
  expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'mine']) // re-sorted
})

test('a resolved refusal freezes the thread locally so the composer goes away', async () => {
  escrowsApi.disputeThread.mockResolvedValueOnce(response([], CONTEXT))
  const { result } = renderHook(() => useDisputeThread('e1'))
  await flush()
  expect(result.current.loading).toBe(false)
  expect(result.current.thread?.read_only).toBe(false)

  escrowsApi.sendDisputeMessage.mockRejectedValue(
    new ApiClientError(409, 'Conflict', 'resolved', ErrorCode.DISPUTE_RESOLVED),
  )
  await act(async () => {
    expect(await result.current.send('too late')).toBe('resolved')
  })
  expect(result.current.thread?.read_only).toBe(true)
})

test('a load failure surfaces the error with a working reload', async () => {
  escrowsApi.disputeThread
    .mockRejectedValueOnce(new Error('down'))
    .mockResolvedValueOnce(response([], CONTEXT))
  const { result } = renderHook(() => useDisputeThread('e1'))
  await flush()
  expect(result.current.error).toBe('down')

  await act(async () => {
    await result.current.reload()
  })
  expect(result.current.error).toBeNull()
})
