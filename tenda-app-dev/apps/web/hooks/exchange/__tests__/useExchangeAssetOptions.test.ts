/**
 * Which assets the reader can actually sell.
 *
 * The load-bearing behaviour is that this hook LOADS what it depends on. It
 * answers from the chain registry and the linked-wallet list, and neither is
 * loaded by the sell surface — measured: the surface showed "Link a wallet" to
 * a reader who had one, because nothing on that route had ever fetched either.
 * Both ensures de-dupe, so the surfaces that already load them are unaffected.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainRegistryEntry, LinkedWallet } from '@tenda/shared'
import { useExchangeAssetOptions } from '@/hooks/exchange/useExchangeAssetOptions'
import { useAuthStore } from '@/stores/auth.store'
import { useChainRegistryStore } from '@/stores/chain-registry.store'

const SOLANA: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana Devnet',
  escrow_address: 'Prog1',
  assets: [
    { id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'Mint1', supports_permit: false },
  ],
}
const WALLET: LinkedWallet = {
  chain_ns: 'solana',
  address: 'SoLAddr1',
  is_primary: true,
  verified_at: '2026-08-01T00:00:00.000Z',
}

const ensureLoaded = vi.fn(async () => {})
const ensureWallets = vi.fn(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  useChainRegistryStore.setState({ chains: null, status: 'idle', ensureLoaded })
  useAuthStore.setState({ wallets: [], ensureWallets })
})

describe('useExchangeAssetOptions', () => {
  it('LOADS the registry and the wallets it depends on', async () => {
    renderHook(() => useExchangeAssetOptions())
    await waitFor(() => expect(ensureLoaded).toHaveBeenCalled())
    expect(ensureWallets).toHaveBeenCalled()
  })

  it('answers nothing while the registry is still absent — and SAYS so', () => {
    const { result } = renderHook(() => useExchangeAssetOptions())
    expect(result.current.options).toEqual([])
    // #60: an empty list is not silence any more. Nothing has settled here, so
    // the surface must not read this as "you have no wallet".
    expect(result.current.section).toBe('loading')
  })

  it('offers an asset only where the reader has a VERIFIED wallet in that namespace', () => {
    useChainRegistryStore.setState({ chains: [SOLANA], status: 'ready' })

    useAuthStore.setState({ wallets: [{ ...WALLET, verified_at: null }] })
    const unverified = renderHook(() => useExchangeAssetOptions())
    expect(unverified.result.current.options).toEqual([])

    // Inside `act`: the unverified hook above is still mounted, so this write
    // re-renders it as well as seeding the next one.
    act(() => {
      useAuthStore.setState({ wallets: [WALLET] })
    })
    const verified = renderHook(() => useExchangeAssetOptions())
    expect(verified.result.current.options).toEqual([
      expect.objectContaining({ chainId: 'solana:devnet', assetId: 'USDC_SOL', walletAddress: 'SoLAddr1' }),
    ])
    expect(verified.result.current.section).toBe('ready')
  })

  it('a settled, wallet-less account is the ONLY case that says "no wallet"', () => {
    useChainRegistryStore.setState({ chains: [SOLANA], status: 'ready' })
    useAuthStore.setState({ wallets: [], walletsStatus: 'ready' })
    const { result } = renderHook(() => useExchangeAssetOptions())
    expect(result.current.section).toBe('no-wallet')
  })

  it('a FAILED wallets load is its own state, never the accusation', () => {
    useChainRegistryStore.setState({ chains: [SOLANA], status: 'ready' })
    useAuthStore.setState({ wallets: [], walletsStatus: 'error' })
    const { result } = renderHook(() => useExchangeAssetOptions())
    expect(result.current.section).toBe('wallets-error')
  })
})
