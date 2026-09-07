/**
 * The exchange data hooks: the screen's dual pagination (market always,
 * my-trades only WITH an id — never a 403 probe), the detail loader's
 * gone-vs-transient split, and the asset options' verified-wallet gate
 * over the shared manifest roles.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import {
  ApiClientError,
  type ChainRegistryEntry,
  type ExchangeDetail,
  type LinkedWallet,
  type SupportedCurrency,
} from '@tenda/shared'

const apiMock = vi.hoisted(() => ({
  exchange: {
    list: vi.fn<() => Promise<{ data: ExchangeDetail[]; pagination: { total: number; limit: number; offset: number } }>>(),
    get: vi.fn<() => Promise<ExchangeDetail>>(),
  },
  users: {
    escrows: vi.fn<() => Promise<{ data: never[]; pagination: { total: number; limit: number; offset: number } }>>(),
  },
}))
vi.mock('@/api/client', () => ({ api: apiMock }))

import { useExchangeScreen } from '@/hooks/exchange/useExchangeScreen'
import { useExchangeDetail } from '@/hooks/exchange/useExchangeDetail'
import { useExchangeAssetOptions } from '@/hooks/exchange/useExchangeAssetOptions'
import { useAuthStore } from '@/stores/auth.store'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { clearAccountState } from '@/lib/account-state'
import { makeExchangeDetail } from '../../../test/factories/exchange'
import { makeUser } from '../../../test/factories/user'

const page = <T,>(data: T[]) => ({ data, pagination: { total: data.length, limit: 20, offset: 0 } })

const NO_FILTERS = { currency: null, chainId: null } as const

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.exchange.list.mockResolvedValue(page([makeExchangeDetail()]))
  apiMock.users.escrows.mockResolvedValue(page([]))
  useAuthStore.setState({ user: null, wallets: [] })
  // The screen's page zero now lives in module-scoped caches so it survives
  // navigating into an offer and back. That also means it survives a TEST —
  // without this, the second run here is seeded and never calls the API.
  clearAccountState()
})

test('signed out: the market loads but my-trades never fires without an id', async () => {
  const { result } = renderHook(() => useExchangeScreen(NO_FILTERS))
  await waitFor(() => expect(result.current.market.items).toHaveLength(1))
  expect(apiMock.users.escrows).not.toHaveBeenCalled()
})

test('signed in: my-trades queries the caller, kind pinned to exchange', async () => {
  useAuthStore.setState({ user: makeUser({ id: 'me' }) })
  const { result } = renderHook(() => useExchangeScreen(NO_FILTERS))
  await waitFor(() => expect(apiMock.users.escrows).toHaveBeenCalled())
  expect(apiMock.users.escrows).toHaveBeenCalledWith(
    { id: 'me' },
    expect.objectContaining({ kind: 'exchange' }),
  )
  await waitFor(() => expect(result.current.myTrades.isLoading).toBe(false))
})

test('the filters arrive as ARGUMENTS and steer both lists', async () => {
  // They live in the URL because opening an offer unmounts the surface; the
  // hook's job is only to pass them through to the two queries.
  const { rerender } = renderHook(
    (filters: { currency: SupportedCurrency | null; chainId: string | null }) =>
      useExchangeScreen(filters),
    { initialProps: NO_FILTERS as { currency: SupportedCurrency | null; chainId: string | null } },
  )
  await waitFor(() => expect(apiMock.exchange.list).toHaveBeenCalled())

  rerender({ currency: 'KES', chainId: 'solana:devnet' })
  await waitFor(() =>
    expect(apiMock.exchange.list).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'KES', chain_id: 'solana:devnet' }),
    ),
  )
})

test('a LOCKED surface fires nothing — both endpoints would refuse it anyway', async () => {
  useAuthStore.setState({ user: makeUser({ id: 'me', advanced_mode_enabled: false }) })
  renderHook(() => useExchangeScreen({ ...NO_FILTERS, enabled: false }))
  await act(async () => {})
  expect(apiMock.exchange.list).not.toHaveBeenCalled()
  expect(apiMock.users.escrows).not.toHaveBeenCalled()
})

test('detail: loads, then a 404 refetch DROPS the offer (gone)', async () => {
  apiMock.exchange.get.mockResolvedValue(makeExchangeDetail())
  const { result } = renderHook(() => useExchangeDetail('exch-1'))
  await waitFor(() => expect(result.current.offer).not.toBeNull())

  apiMock.exchange.get.mockRejectedValue(new ApiClientError(404, 'Not Found', 'Escrow not found'))
  await act(() => result.current.refresh())
  expect(result.current.offer).toBeNull()
  expect(result.current.error?.gone).toBe(true)
})

test('detail: a transient failure KEEPS the last good offer on screen', async () => {
  apiMock.exchange.get.mockResolvedValue(makeExchangeDetail())
  const { result } = renderHook(() => useExchangeDetail('exch-1'))
  await waitFor(() => expect(result.current.offer).not.toBeNull())

  apiMock.exchange.get.mockRejectedValue(new Error('network down'))
  await act(() => result.current.refresh())
  expect(result.current.offer).not.toBeNull()
  expect(result.current.error?.gone).toBe(false)
})

const SOLANA_CHAIN: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana Devnet',
  escrow_address: 'Prog1',
  assets: [
    { id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'Mint1', supports_permit: false },
  ],
}
const VERIFIED_SOL: LinkedWallet = {
  chain_ns: 'solana',
  address: 'SoLAddr1',
  is_primary: true,
  verified_at: '2026-08-01T00:00:00.000Z',
}

test('asset options: only chains with a VERIFIED wallet in that namespace', () => {
  // Each `setState` re-renders every hook still mounted from the case before
  // it, so the store writes go through `act` — otherwise React warns, and a
  // warning that is always there is one nobody reads when it means something.
  act(() => {
    useChainRegistryStore.setState({ chains: [SOLANA_CHAIN], status: 'ready' })
    useAuthStore.setState({ wallets: [] })
  })
  const none = renderHook(() => useExchangeAssetOptions())
  expect(none.result.current.options).toEqual([])

  act(() => {
    useAuthStore.setState({ wallets: [{ ...VERIFIED_SOL, verified_at: null }] })
  })
  const unverified = renderHook(() => useExchangeAssetOptions())
  expect(unverified.result.current.options).toEqual([])

  act(() => {
    useAuthStore.setState({ wallets: [VERIFIED_SOL] })
  })
  const verified = renderHook(() => useExchangeAssetOptions())
  expect(verified.result.current.options).toEqual([
    expect.objectContaining({ chainId: 'solana:devnet', assetId: 'USDC_SOL', walletAddress: 'SoLAddr1' }),
  ])
})
