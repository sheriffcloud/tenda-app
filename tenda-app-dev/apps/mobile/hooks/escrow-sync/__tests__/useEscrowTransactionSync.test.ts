import { act, renderHook, waitFor } from '@testing-library/react-native'
import { ESCROW_RPC_POLL_MS, ESCROW_SYNC_POLL_MS, ESCROW_SYNC_TIMEOUT_MS } from '../constants'
import { useEscrowTransactionSync } from '../useEscrowTransactionSync'

const mockGetSolanaStatus = jest.fn()
const mockGetEvmStatus = jest.fn()
let mockEscrowFrame: ((frame: { tx_ref: string }) => void) | null = null

jest.mock('@/wallet', () => ({
  getTransactionStatus: (...args: string[]) => mockGetSolanaStatus(...args),
}))
// The EVM receipt poll moved to @tenda/shared (2026-08-15); partial mock.
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  getEvmTransactionStatus: (...args: string[]) => mockGetEvmStatus(...args),
}))
jest.mock('@/stores/realtime.store', () => ({
  subscribeEscrowChannel: (_id: string, callback: (frame: { tx_ref: string }) => void) => {
    mockEscrowFrame = callback
    return () => { mockEscrowFrame = null }
  },
}))

beforeEach(() => {
  jest.useFakeTimers()
  mockGetSolanaStatus.mockReset().mockResolvedValue('not_found')
  mockGetEvmStatus.mockReset().mockResolvedValue('not_found')
  mockEscrowFrame = null
})
afterEach(() => jest.useRealTimers())

test('an EVM receipt enters syncing and waits for the authoritative read', async () => {
  mockGetEvmStatus.mockResolvedValue('confirmed')
  const checkApplied = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const { result } = renderHook(() => useEscrowTransactionSync({
    signature: '0xtx', escrowId: 'e1', chainId: 'eip155:8453', checkApplied,
  }))

  await waitFor(() => expect(result.current.state).toBe('syncing'))
  expect(result.current.state).not.toBe('applied')
  act(() => jest.advanceTimersByTime(ESCROW_SYNC_POLL_MS))
  await waitFor(() => expect(result.current.state).toBe('applied'))
})

test('a matching server frame applies immediately even before RPC catches up', () => {
  const { result } = renderHook(() => useEscrowTransactionSync({
    signature: 'sig-1', escrowId: 'e1', chainId: 'solana:devnet', checkApplied: async () => false,
  }))
  act(() => mockEscrowFrame?.({ tx_ref: 'other' }))
  expect(result.current.state).toBe('waiting')
  act(() => mockEscrowFrame?.({ tx_ref: 'sig-1' }))
  expect(result.current.state).toBe('applied')
})

test('a late RPC response cannot overwrite an exact server confirmation', async () => {
  let resolveRpc!: (status: string) => void
  mockGetSolanaStatus.mockReturnValue(new Promise((resolve) => { resolveRpc = resolve }))
  const { result } = renderHook(() => useEscrowTransactionSync({
    signature: 'sig-race', escrowId: 'e1', chainId: 'solana:devnet', checkApplied: async () => false,
  }))

  act(() => mockEscrowFrame?.({ tx_ref: 'sig-race' }))
  expect(result.current.state).toBe('applied')
  await act(async () => { resolveRpc('confirmed'); await Promise.resolve() })
  expect(result.current.state).toBe('applied')
})

test('RPC failures retry and do not falsely fail the transaction', async () => {
  mockGetSolanaStatus.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('failed')
  const { result } = renderHook(() => useEscrowTransactionSync({
    signature: 'sig-1', chainId: 'solana:devnet', checkApplied: async () => false,
  }))
  await act(async () => { await Promise.resolve() })
  expect(result.current.state).toBe('waiting')
  act(() => jest.advanceTimersByTime(ESCROW_RPC_POLL_MS))
  await waitFor(() => expect(result.current.state).toBe('failed'))
})

test('reports chain confirmation as deferred after the chain deadline', async () => {
  jest.setSystemTime(0)
  const { result } = renderHook(() => useEscrowTransactionSync({
    signature: 'sig-pending', chainId: 'solana:devnet', checkApplied: async () => false,
  }))
  await act(async () => { await Promise.resolve() })
  jest.setSystemTime(ESCROW_SYNC_TIMEOUT_MS + 1)
  act(() => jest.advanceTimersByTime(ESCROW_RPC_POLL_MS))
  await waitFor(() => expect(result.current).toEqual({
    state: 'deferred', failure: 'Transaction is pending and will continue syncing.',
  }))
})

test('reports server application as deferred without falsely confirming', async () => {
  jest.setSystemTime(0)
  mockGetEvmStatus.mockResolvedValue('confirmed')
  const checkApplied = jest.fn().mockResolvedValue(false)
  const { result } = renderHook(() => useEscrowTransactionSync({
    signature: '0xslow', chainId: 'eip155:8453', checkApplied,
  }))
  await waitFor(() => expect(result.current.state).toBe('syncing'))
  jest.setSystemTime(ESCROW_SYNC_TIMEOUT_MS + 1)
  act(() => jest.advanceTimersByTime(ESCROW_SYNC_POLL_MS))
  await waitFor(() => expect(result.current).toEqual({
    state: 'deferred', failure: 'Transaction confirmed on-chain and is still syncing.',
  }))
})

test('a finalized Solana transaction also waits for and accepts server evidence', async () => {
  mockGetSolanaStatus.mockResolvedValue('finalized')
  const checkApplied = jest.fn().mockResolvedValue(true)
  const { result } = renderHook(() => useEscrowTransactionSync({
    signature: 'sig-final', checkApplied,
  }))
  await waitFor(() => expect(result.current.state).toBe('applied'))
  expect(checkApplied).toHaveBeenCalledTimes(1)
})

test('a transient authoritative-read failure retries instead of losing a confirmed tx', async () => {
  mockGetEvmStatus.mockResolvedValue('confirmed')
  const checkApplied = jest.fn()
    .mockRejectedValueOnce(new Error('temporary API outage'))
    .mockResolvedValueOnce(true)
  const { result } = renderHook(() => useEscrowTransactionSync({
    signature: '0xretry', chainId: 'eip155:8453', checkApplied,
  }))
  await waitFor(() => expect(result.current.state).toBe('syncing'))
  act(() => jest.advanceTimersByTime(ESCROW_SYNC_POLL_MS))
  await waitFor(() => expect(result.current.state).toBe('applied'))
  expect(checkApplied).toHaveBeenCalledTimes(2)
})
