/**
 * Web port of mobile's useEscrowTransactionSync suite — same state machine
 * (chain receipt is progress; only a server frame/read proves convergence),
 * web transports mocked at their seams. The WS frame path is exercised
 * with the realtime store's subscribeEscrowChannel mocked, so the socket
 * implementation cannot silently change these semantics.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const mockGetSolanaStatus = vi.fn()
const mockGetEvmStatus = vi.fn()
let mockEscrowFrame: ((frame: { tx_ref: string }) => void) | null = null

vi.mock('@/wallet/send', () => ({
  getSolanaTransactionStatus: (...args: string[]) => mockGetSolanaStatus(...args),
}))
vi.mock('@tenda/shared', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@tenda/shared')),
  getEvmTransactionStatus: (...args: string[]) => mockGetEvmStatus(...args),
}))
vi.mock('@/stores/realtime.store', () => ({
  subscribeEscrowChannel: (_id: string, callback: (frame: { tx_ref: string }) => void) => {
    mockEscrowFrame = callback
    return () => {
      mockEscrowFrame = null
    }
  },
}))

import {
  ESCROW_RPC_POLL_MS,
  ESCROW_SYNC_POLL_MS,
  ESCROW_SYNC_TIMEOUT_MS,
  useEscrowTransactionSync,
} from '@/hooks/escrow/sync/useEscrowTransactionSync'

beforeEach(() => {
  vi.useFakeTimers()
  mockGetSolanaStatus.mockReset().mockResolvedValue('not_found')
  mockGetEvmStatus.mockReset().mockResolvedValue('not_found')
  mockEscrowFrame = null
})
afterEach(() => vi.useRealTimers())

/** waitFor with fake timers: advance microtasks without real waiting. */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

test('an EVM receipt enters syncing and waits for the authoritative read', async () => {
  mockGetEvmStatus.mockResolvedValue('confirmed')
  const checkApplied = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const { result } = renderHook(() =>
    useEscrowTransactionSync({ signature: '0xtx', escrowId: 'e1', chainId: 'eip155:8453', checkApplied }),
  )

  await flush()
  expect(result.current.state).toBe('syncing')
  act(() => vi.advanceTimersByTime(ESCROW_SYNC_POLL_MS))
  await flush()
  expect(result.current.state).toBe('applied')
})

test('a matching server frame applies immediately even before RPC catches up', () => {
  const { result } = renderHook(() =>
    useEscrowTransactionSync({
      signature: 'sig-1',
      escrowId: 'e1',
      chainId: 'solana:devnet',
      checkApplied: async () => false,
    }),
  )
  act(() => mockEscrowFrame?.({ tx_ref: 'other' }))
  expect(result.current.state).toBe('waiting')
  act(() => mockEscrowFrame?.({ tx_ref: 'sig-1' }))
  expect(result.current.state).toBe('applied')
})

test('a late RPC response cannot overwrite an exact server confirmation', async () => {
  let resolveRpc!: (status: string) => void
  mockGetSolanaStatus.mockReturnValue(new Promise((resolve) => { resolveRpc = resolve }))
  const { result } = renderHook(() =>
    useEscrowTransactionSync({
      signature: 'sig-race',
      escrowId: 'e1',
      chainId: 'solana:devnet',
      checkApplied: async () => false,
    }),
  )

  act(() => mockEscrowFrame?.({ tx_ref: 'sig-race' }))
  expect(result.current.state).toBe('applied')
  await act(async () => {
    resolveRpc('confirmed')
    await Promise.resolve()
  })
  expect(result.current.state).toBe('applied')
})

test('RPC failures retry and do not falsely fail the transaction', async () => {
  mockGetSolanaStatus.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('failed')
  const { result } = renderHook(() =>
    useEscrowTransactionSync({ signature: 'sig-1', chainId: 'solana:devnet', checkApplied: async () => false }),
  )
  await flush()
  expect(result.current.state).toBe('waiting')
  act(() => vi.advanceTimersByTime(ESCROW_RPC_POLL_MS))
  await flush()
  expect(result.current.state).toBe('failed')
})

test('reports chain confirmation as deferred after the chain deadline', async () => {
  vi.setSystemTime(0)
  const { result } = renderHook(() =>
    useEscrowTransactionSync({ signature: 'sig-pending', chainId: 'solana:devnet', checkApplied: async () => false }),
  )
  await flush()
  vi.setSystemTime(ESCROW_SYNC_TIMEOUT_MS + 1)
  act(() => vi.advanceTimersByTime(ESCROW_RPC_POLL_MS))
  await flush()
  expect(result.current).toEqual({
    state: 'deferred',
    failure: 'Transaction is pending and will continue syncing.',
  })
})

test('reports server application as deferred without falsely confirming', async () => {
  vi.setSystemTime(0)
  mockGetEvmStatus.mockResolvedValue('confirmed')
  const checkApplied = vi.fn().mockResolvedValue(false)
  const { result } = renderHook(() =>
    useEscrowTransactionSync({ signature: '0xslow', chainId: 'eip155:8453', checkApplied }),
  )
  await flush()
  expect(result.current.state).toBe('syncing')
  vi.setSystemTime(ESCROW_SYNC_TIMEOUT_MS + 1)
  act(() => vi.advanceTimersByTime(ESCROW_SYNC_POLL_MS))
  await flush()
  expect(result.current).toEqual({
    state: 'deferred',
    failure: 'Transaction confirmed on-chain and is still syncing.',
  })
})

test('a finalized Solana transaction also waits for and accepts server evidence', async () => {
  mockGetSolanaStatus.mockResolvedValue('finalized')
  const checkApplied = vi.fn().mockResolvedValue(true)
  const { result } = renderHook(() => useEscrowTransactionSync({ signature: 'sig-final', checkApplied }))
  await flush()
  expect(result.current.state).toBe('applied')
  expect(checkApplied).toHaveBeenCalledTimes(1)
})

test('a transient authoritative-read failure retries instead of losing a confirmed tx', async () => {
  mockGetEvmStatus.mockResolvedValue('confirmed')
  const checkApplied = vi.fn()
    .mockRejectedValueOnce(new Error('temporary API outage'))
    .mockResolvedValueOnce(true)
  const { result } = renderHook(() =>
    useEscrowTransactionSync({ signature: '0xretry', chainId: 'eip155:8453', checkApplied }),
  )
  await flush()
  expect(result.current.state).toBe('syncing')
  act(() => vi.advanceTimersByTime(ESCROW_SYNC_POLL_MS))
  await flush()
  expect(result.current.state).toBe('applied')
  expect(checkApplied).toHaveBeenCalledTimes(2)
})

test('unmount stops the loop; a cleared signature resets to waiting', async () => {
  const { result, rerender, unmount } = renderHook(
    ({ signature }: { signature: string | null }) =>
      useEscrowTransactionSync({ signature, chainId: 'solana:devnet', checkApplied: async () => false }),
    { initialProps: { signature: 'sig-1' as string | null } },
  )
  await flush()
  rerender({ signature: null })
  expect(result.current.state).toBe('waiting')
  unmount()
  act(() => vi.advanceTimersByTime(ESCROW_RPC_POLL_MS * 3))
  // No crash / no state updates after unmount is the assertion here.
})
