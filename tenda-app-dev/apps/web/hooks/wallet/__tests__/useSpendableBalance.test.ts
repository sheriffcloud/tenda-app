/**
 * useSpendableBalance (web) — mount-refresh port of mobile's hook: the
 * answer is keyed to (chain, asset), unknown is never zero, a loading
 * registry never latches unknown, and stale reads are discarded.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ChainRegistryEntry } from '@tenda/shared'

const { mockReadSpendable, mockSigners, registryState } = vi.hoisted(() => ({
  mockReadSpendable: vi.fn(),
  mockSigners: { current: ['0xabc'] as string[] },
  registryState: { chains: null as ChainRegistryEntry[] | null },
}))

vi.mock('@tenda/shared', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@tenda/shared')),
  readSpendableBalance: (...a: unknown[]) => mockReadSpendable(...a),
}))
vi.mock('@/wallet/dispatch', () => ({
  resolveSignersForChain: () => mockSigners.current,
}))
vi.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: (selector: (s: { chains: ChainRegistryEntry[] | null }) => unknown) =>
    selector(registryState),
  selectChainById: (chains: ChainRegistryEntry[] | null, id: string) =>
    chains?.find((c) => c.id === id) ?? null,
}))

import { useSpendableBalance } from '@/hooks/wallet/useSpendableBalance'

const CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
  ],
}

const BALANCE = { assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '48500000', decimals: 6, isStable: true }

beforeEach(() => {
  registryState.chains = [CHAIN]
  mockSigners.current = ['0xabc']
  mockReadSpendable.mockResolvedValue(BALANCE)
})

test('reads across every candidate signer for the asset and lands on ready', async () => {
  mockSigners.current = ['0xabc', '0xsecond']
  const { result } = renderHook(() => useSpendableBalance(CHAIN.id, 'USDC_BASE'))
  expect(result.current.status).toBe('loading')
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.balance).toEqual(BALANCE)
  expect(mockReadSpendable).toHaveBeenCalledWith(['0xabc', '0xsecond'], CHAIN, 'USDC_BASE')
})

test('a failed read answers UNKNOWN (null), never zero', async () => {
  mockReadSpendable.mockRejectedValue(new Error('rpc down'))
  const { result } = renderHook(() => useSpendableBalance(CHAIN.id, 'USDC_BASE'))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.balance).toBeNull()
})

test('no linked wallet answers unknown without a read', async () => {
  mockSigners.current = []
  const { result } = renderHook(() => useSpendableBalance(CHAIN.id, 'USDC_BASE'))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.balance).toBeNull()
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('a still-loading registry stays loading rather than latching unknown', async () => {
  registryState.chains = null
  const { result } = renderHook(() => useSpendableBalance(CHAIN.id, 'USDC_BASE'))
  await act(async () => {
    await Promise.resolve()
  })
  expect(result.current.status).toBe('loading')
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('changing the key invalidates the previous answer by derivation', async () => {
  const { result, rerender } = renderHook(
    ({ chainId }: { chainId: string }) => useSpendableBalance(chainId, 'USDC_BASE'),
    { initialProps: { chainId: CHAIN.id } },
  )
  await waitFor(() => expect(result.current.status).toBe('ready'))
  // Unknown chain → the old answer must not be shown for the new key.
  rerender({ chainId: 'eip155:999' })
  await waitFor(() => expect(result.current.balance).toBeNull())
})

test('an owner scopes the read to that ONE wallet, not the linked set', async () => {
  mockSigners.current = ['0xabc', '0xsecond']
  const { result } = renderHook(() => useSpendableBalance(CHAIN.id, 'USDC_BASE', '0xsecond'))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(mockReadSpendable).toHaveBeenCalledWith(['0xsecond'], CHAIN, 'USDC_BASE')
})

test('a null owner (unresolved signer) answers unknown without a read', async () => {
  const { result } = renderHook(() => useSpendableBalance(CHAIN.id, 'USDC_BASE', null))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.balance).toBeNull()
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('an owner change invalidates the previous answer and re-reads as the new one', async () => {
  mockReadSpendable
    .mockResolvedValueOnce(BALANCE)
    .mockResolvedValueOnce({ ...BALANCE, amountRaw: '7' })
  const { result, rerender } = renderHook(
    ({ owner }: { owner: string }) => useSpendableBalance(CHAIN.id, 'USDC_BASE', owner),
    { initialProps: { owner: '0xabc' } },
  )
  await waitFor(() => expect(result.current.balance?.amountRaw).toBe(BALANCE.amountRaw))
  rerender({ owner: '0xswitched' })
  // The old wallet's answer must never be shown for the new key.
  expect(result.current.status).toBe('loading')
  await waitFor(() => expect(result.current.balance?.amountRaw).toBe('7'))
  expect(mockReadSpendable).toHaveBeenLastCalledWith(['0xswitched'], CHAIN, 'USDC_BASE')
})

test('refresh re-reads and a stale in-flight read is discarded', async () => {
  let resolveFirst!: (v: unknown) => void
  mockReadSpendable
    .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res }))
    .mockResolvedValueOnce({ ...BALANCE, amountRaw: '99' })
  const { result } = renderHook(() => useSpendableBalance(CHAIN.id, 'USDC_BASE'))
  act(() => {
    result.current.refresh() // supersedes the mount read
  })
  await waitFor(() => expect(result.current.balance?.amountRaw).toBe('99'))
  await act(async () => {
    resolveFirst(BALANCE) // the stale first answer must be dropped
    await Promise.resolve()
  })
  expect(result.current.balance?.amountRaw).toBe('99')
})
