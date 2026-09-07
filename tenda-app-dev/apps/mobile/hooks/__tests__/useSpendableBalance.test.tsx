/**
 * useSpendableBalance — the namespace-agnostic replacement for the
 * SOL-native-only useWalletBalance. Verifies the tri-state (loading vs a known
 * balance vs 'ready' + null = UNKNOWN), that it reads across every candidate
 * signer rather than a raw auth-store slot, that a late registry still
 * resolves, that it re-reads only when the (chain, asset) key changes, and
 * that a same-key refresh does not blank the previous answer (flicker).
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { ChainRegistryEntry } from '@tenda/shared'

// expo-router's focus effect ≈ mount + re-run when the callback identity moves.
// `require`d inside the factory: jest hoists it above the import statements.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react')
    useEffect(cb, [cb])
  },
}))

const mockReadSpendable = jest.fn()
// readSpendableBalance moved to @tenda/shared (2026-08-15); partial mock.
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  readSpendableBalance: (...a: unknown[]) => mockReadSpendable(...a),
}))

let mockSigners: string[] = ['0xabc']
jest.mock('@/wallet/dispatch', () => ({ resolveSignersForChain: () => mockSigners }))

const CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
  ],
}

let mockChains: ChainRegistryEntry[] | null = [CHAIN]
jest.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: (selector: (s: { chains: ChainRegistryEntry[] | null }) => unknown) =>
    selector({ chains: mockChains }),
  selectChainById: (chains: ChainRegistryEntry[] | null, id: string) =>
    chains?.find((c) => c.id === id) ?? null,
}))

import { useSpendableBalance } from '@/hooks/useSpendableBalance'

const USDC = { assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '48500000', decimals: 6, isStable: true }

beforeEach(() => {
  mockReadSpendable.mockReset().mockResolvedValue(USDC)
  mockSigners = ['0xabc']
  mockChains = [CHAIN]
})

test('reads across every candidate signer for the asset and lands on ready', async () => {
  mockSigners = ['0xabc', '0xsecond']
  const { result } = renderHook(() => useSpendableBalance('eip155:84532', 'USDC_BASE'))

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.balance).toEqual(USDC)
  // The same read the gate uses, so the hint can't contradict the block.
  expect(mockReadSpendable).toHaveBeenCalledWith(['0xabc', '0xsecond'], CHAIN, 'USDC_BASE')
})

test('stays loading while the chain registry has not landed', async () => {
  mockChains = null

  const { result } = renderHook(() => useSpendableBalance('eip155:84532', 'USDC_BASE'))

  expect(result.current.status).toBe('loading')
  expect(result.current.balance).toBeNull()
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('a late-loading registry resolves into a real read rather than latching unknown', async () => {
  mockChains = null
  const { result, rerender } = renderHook(() => useSpendableBalance('eip155:84532', 'USDC_BASE'))
  expect(result.current.status).toBe('loading')

  mockChains = [CHAIN]
  rerender({})

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.balance).toEqual(USDC)
})

test('no linked wallet → ready with an UNKNOWN balance, and no RPC', async () => {
  mockSigners = []

  const { result } = renderHook(() => useSpendableBalance('eip155:84532', 'USDC_BASE'))

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.balance).toBeNull()
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('a chain outside the registry is ready + unknown, never a crash', async () => {
  const { result } = renderHook(() => useSpendableBalance('eip155:999999', 'USDC_BASE'))

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.balance).toBeNull()
})

test('a failed read is UNKNOWN, not zero', async () => {
  mockReadSpendable.mockRejectedValue(new Error('rpc down'))

  const { result } = renderHook(() => useSpendableBalance('eip155:84532', 'USDC_BASE'))

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.balance).toBeNull()
})

test('re-rendering with the same key does NOT re-read (no RPC per keystroke)', async () => {
  const { result, rerender } = renderHook(() => useSpendableBalance('eip155:84532', 'USDC_BASE'))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(mockReadSpendable).toHaveBeenCalledTimes(1)

  // Stands in for the budget field changing on every digit typed.
  rerender({})
  rerender({})
  rerender({})

  expect(mockReadSpendable).toHaveBeenCalledTimes(1)
})

test('changing the chain re-reads against the new chain', async () => {
  const other: ChainRegistryEntry = { ...CHAIN, id: 'eip155:8453', display_name: 'Base' }
  mockChains = [CHAIN, other]
  const { result, rerender } = renderHook(({ id }: { id: string }) => useSpendableBalance(id, 'USDC_BASE'), {
    initialProps: { id: 'eip155:84532' },
  })
  await waitFor(() => expect(result.current.status).toBe('ready'))

  rerender({ id: 'eip155:8453' })

  await waitFor(() => expect(mockReadSpendable).toHaveBeenCalledTimes(2))
  expect(mockReadSpendable).toHaveBeenLastCalledWith(['0xabc'], other, 'USDC_BASE')
})

test('a stale in-flight read cannot overwrite the current chain’s balance', async () => {
  const other: ChainRegistryEntry = { ...CHAIN, id: 'eip155:8453', display_name: 'Base' }
  mockChains = [CHAIN, other]
  const STALE = { ...USDC, amountRaw: '1' }
  const FRESH = { ...USDC, amountRaw: '999' }

  let resolveStale: (v: typeof STALE) => void = () => {}
  mockReadSpendable.mockReturnValueOnce(new Promise((r) => { resolveStale = r }))
  mockReadSpendable.mockResolvedValueOnce(FRESH)

  const { result, rerender } = renderHook(({ id }: { id: string }) => useSpendableBalance(id, 'USDC_BASE'), {
    initialProps: { id: 'eip155:84532' },
  })
  rerender({ id: 'eip155:8453' })
  await waitFor(() => expect(result.current.balance).toEqual(FRESH))

  // The first chain's read finally answers — it must be discarded.
  await act(async () => { resolveStale(STALE) })

  expect(result.current.balance).toEqual(FRESH)
})

test('refresh() re-reads on demand', async () => {
  const { result } = renderHook(() => useSpendableBalance('eip155:84532', 'USDC_BASE'))
  await waitFor(() => expect(result.current.status).toBe('ready'))

  await act(async () => { result.current.refresh() })

  expect(mockReadSpendable).toHaveBeenCalledTimes(2)
})

// --- no flicker on refocus --------------------------------------------------

test('a same-key refresh keeps the previous answer on screen (no flicker)', async () => {
  const { result } = renderHook(() => useSpendableBalance('eip155:84532', 'USDC_BASE'))
  await waitFor(() => expect(result.current.balance).toEqual(USDC))

  // Refocus re-reads. The old answer for THIS key must stay visible until the
  // new one lands, or an advisory nudge blinks out on every tab return.
  let resolveNext: (v: typeof USDC) => void = () => {}
  mockReadSpendable.mockReturnValueOnce(new Promise((r) => { resolveNext = r }))
  await act(async () => { result.current.refresh() })

  expect(result.current.balance).toEqual(USDC)
  expect(result.current.status).toBe('ready')

  const FRESH = { ...USDC, amountRaw: '999' }
  await act(async () => { resolveNext(FRESH) })
  expect(result.current.balance).toEqual(FRESH)
})

test('changing the key DOES blank the answer — a stale chain must never show', async () => {
  const other: ChainRegistryEntry = { ...CHAIN, id: 'eip155:8453', display_name: 'Base' }
  mockChains = [CHAIN, other]
  const { result, rerender } = renderHook(({ id }: { id: string }) => useSpendableBalance(id, 'USDC_BASE'), {
    initialProps: { id: 'eip155:84532' },
  })
  await waitFor(() => expect(result.current.balance).toEqual(USDC))

  mockReadSpendable.mockReturnValueOnce(new Promise(() => {})) // never settles
  rerender({ id: 'eip155:8453' })

  // The other chain's balance is not this chain's answer.
  expect(result.current.balance).toBeNull()
  expect(result.current.status).toBe('loading')
})
