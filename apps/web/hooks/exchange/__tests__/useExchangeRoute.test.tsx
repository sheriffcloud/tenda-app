/**
 * The exchange surface's URL state, and the one thing it has to defend
 * against: keys that arrive from OUTSIDE the app.
 *
 * The whole reason the filters live in the address is that the view is worth
 * linking to — which means a link outlives the deployment it was made on. A
 * `?chain=` the running registry no longer serves is a 400 from the server, so
 * forwarding it would answer a stale bookmark with "Offers could not be loaded"
 * over a Try-again that can never succeed. The feed states this rule for itself
 * in lib/gigs/search-params.ts; this is the same rule, client-side.
 */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainRegistryEntry } from '@tenda/shared'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { useExchangeRoute } from '@/hooks/exchange/useExchangeRoute'

const params = vi.hoisted(() => ({ current: new URLSearchParams() }))
vi.mock('next/navigation', () => ({ useSearchParams: () => params.current }))

// Direct assertion, not `as unknown as`: this still type-checks the fields
// the fixture DOES state, so a renamed or mistyped one fails to compile.
const SOLANA = { id: 'solana:devnet', display_name: 'Solana Devnet' } as ChainRegistryEntry

beforeEach(() => {
  params.current = new URLSearchParams()
  useChainRegistryStore.setState({ chains: null, status: 'idle', ensureLoaded: async () => {} })
})

describe('useExchangeRoute', () => {
  it('reads the tab and the currency, defaulting what is absent', () => {
    params.current = new URLSearchParams('tab=mine&cur=KES')
    const { result } = renderHook(() => useExchangeRoute())
    expect(result.current.route).toEqual({ tab: 'mine', currency: 'KES', chainId: null })
    // Nothing to settle when no chain is filtering.
    expect(result.current.chainReady).toBe(true)
  })

  it('refuses a currency that is not a payout currency', () => {
    params.current = new URLSearchParams('cur=XYZ')
    expect(renderHook(() => useExchangeRoute()).result.current.route.currency).toBeNull()
  })

  it('WAITS for the registry rather than filtering on an unverified chain', () => {
    params.current = new URLSearchParams('chain=solana:devnet')
    const { result } = renderHook(() => useExchangeRoute())
    expect(result.current.chainReady).toBe(false)
    expect(result.current.route.chainId).toBe('solana:devnet')
  })

  it('keeps a chain the deployment actually serves', () => {
    params.current = new URLSearchParams('chain=solana:devnet')
    useChainRegistryStore.setState({ chains: [SOLANA], status: 'ready' })
    const { result } = renderHook(() => useExchangeRoute())
    expect(result.current.route.chainId).toBe('solana:devnet')
    expect(result.current.chainReady).toBe(true)
  })

  it('DROPS a chain it does not serve, instead of asking the server to 400', () => {
    params.current = new URLSearchParams('chain=eip155:99999')
    useChainRegistryStore.setState({ chains: [SOLANA], status: 'ready' })
    const { result } = renderHook(() => useExchangeRoute())
    expect(result.current.route.chainId).toBeNull()
    expect(result.current.chainReady).toBe(true)
  })

  it('stops waiting when the registry itself has failed', () => {
    // Otherwise a registry outage hides the whole order book behind a
    // skeleton that never resolves — strictly worse than one request that
    // might be refused.
    params.current = new URLSearchParams('chain=solana:devnet')
    useChainRegistryStore.setState({ chains: null, status: 'error' })
    const { result } = renderHook(() => useExchangeRoute())
    expect(result.current.chainReady).toBe(true)
    expect(result.current.route.chainId).toBe('solana:devnet')
  })
})
