/**
 * useWalletScreen (web) — the ported invariants that matter on this
 * platform: the USDC headline is the exact base-unit sum, the section
 * resolver's answers pass through untouched, a failed summary keeps the
 * last-good totals, and refresh reads the freshly-settled store values (not
 * a stale closure).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ChainRegistryEntry, LinkedWallet, WalletChainBalance } from '@tenda/shared'

const mockReadBalances = vi.fn()
vi.mock('@tenda/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tenda/shared')>()),
  readWalletBalances: (...a: unknown[]) => mockReadBalances(...a),
}))

const mockTransactions = vi.fn()
const mockSummary = vi.fn()
vi.mock('@/api/client', () => ({
  api: {
    users: {
      transactions: (p: unknown, q: unknown) => mockTransactions(p, q),
      transactionsSummary: (p: unknown) => mockSummary(p),
    },
  },
}))

const CHAIN: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana Devnet',
  escrow_address: 'P',
  assets: [],
}
const WALLET: LinkedWallet = { chain_ns: 'solana', address: 'SoL1', is_primary: true, verified_at: 'now' }

const authState = {
  user: { id: 'u1' } as { id: string } | null,
  wallets: [WALLET] as LinkedWallet[],
  walletsStatus: 'ready' as string,
  refreshWallets: vi.fn(async () => {}),
}
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign((sel: (s: typeof authState) => unknown) => sel(authState), {
    getState: () => authState,
  }),
}))

const registryState = {
  chains: [CHAIN] as ChainRegistryEntry[] | null,
  status: 'ready' as string,
  ensureLoaded: vi.fn(async () => {}),
}
vi.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: Object.assign((sel: (s: typeof registryState) => unknown) => sel(registryState), {
    getState: () => registryState,
  }),
}))

import { useWalletScreen } from '@/hooks/wallet/useWalletScreen'

function balance(chainId: string, usdcRaw: string): WalletChainBalance {
  return {
    chainId,
    namespace: 'solana',
    displayName: 'Solana Devnet',
    address: 'SoL1',
    usdc: { assetId: 'USDC_SOL', symbol: 'USDC', amountRaw: usdcRaw, decimals: 6, isStable: true },
    native: null,
  }
}

beforeEach(() => {
  authState.user = { id: 'u1' }
  authState.wallets = [WALLET]
  authState.walletsStatus = 'ready'
  registryState.chains = [CHAIN]
  registryState.status = 'ready'
  mockReadBalances.mockResolvedValue([balance('solana:devnet', '48500000')])
  mockTransactions.mockResolvedValue({ data: [], total: 0, limit: 20, offset: 0 })
  mockSummary.mockResolvedValue({ earned_raw: '80000000', spent_raw: '30000000', asset: 'USDC_SOL' })
})

describe('happy path', () => {
  it('sums USDC across reads, surfaces lifetime totals, resolves ready', async () => {
    mockReadBalances.mockResolvedValue([
      balance('solana:devnet', '48500000'),
      balance('eip155:84532', '1500000'),
    ])
    const { result } = renderHook(() => useWalletScreen())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.totalUsdc).toBe(50) // 48.5 + 1.5, exact base units
    expect(result.current.earnedUsdc).toBe(80)
    expect(result.current.spentUsdc).toBe(30)
    expect(result.current.section).toBe('ready')
    // Mount re-resolves both upstreams (the cold-start-blip healing).
    expect(authState.refreshWallets).toHaveBeenCalled()
    expect(registryState.ensureLoaded).toHaveBeenCalled()
  })
})

describe('section resolution passthrough', () => {
  it('a failed wallets load is wallets-error, never "no wallet"', async () => {
    authState.wallets = []
    authState.walletsStatus = 'error'
    const { result } = renderHook(() => useWalletScreen())
    await waitFor(() => expect(result.current.section).toBe('wallets-error'))
  })

  it('an unusable registry with linked wallets is balances-unavailable, never 0.00', async () => {
    registryState.chains = null
    registryState.status = 'error'
    const { result } = renderHook(() => useWalletScreen())
    await waitFor(() => expect(result.current.section).toBe('balances-unavailable'))
  })
})

describe('resilience', () => {
  it('a failed summary keeps the zeros rather than crashing; balances still land', async () => {
    mockSummary.mockRejectedValue(new Error('summary down'))
    const { result } = renderHook(() => useWalletScreen())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.totalUsdc).toBe(48.5)
    expect(result.current.earnedUsdc).toBe(0)
  })

  it('a failed balance read renders empty balances, not a crash', async () => {
    mockReadBalances.mockRejectedValue(new Error('rpc down'))
    const { result } = renderHook(() => useWalletScreen())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.balances).toEqual([])
    expect(result.current.totalUsdc).toBe(0)
  })
})

describe('refresh', () => {
  it('re-resolves the upstreams first, then reads the freshly-settled store values', async () => {
    const { result } = renderHook(() => useWalletScreen())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The refresh must see THIS list (settled by refreshWallets), not the
    // closure's copy from before the gesture.
    const freshWallet: LinkedWallet = { chain_ns: 'solana', address: 'SoLNEW', is_primary: true, verified_at: 'now' }
    authState.refreshWallets.mockImplementation(async () => {
      authState.wallets = [freshWallet]
    })
    mockReadBalances.mockClear()

    await act(() => result.current.handleRefresh())
    const readWith = mockReadBalances.mock.calls.at(-1)?.[0] as LinkedWallet[]
    expect(readWith).toEqual([freshWallet])
  })
})
