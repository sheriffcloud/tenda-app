/**
 * Chain-registry store (web) — the recovery semantics ported from mobile's
 * suite, minus persistence (web fetches per page load): in-flight joins, an
 * EMPTY payload is a broken deployment (never "loaded"), a failed refresh
 * over good data stays invisible, and ensureLoaded only fetches when there
 * is nothing usable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainRegistryEntry } from '@tenda/shared'

const mockChainsRequest = vi.fn()
vi.mock('@/api/client', () => ({
  api: { platform: { chains: () => mockChainsRequest() } },
}))

import { selectChainById, useChainRegistryStore } from '@/stores/chain-registry.store'
import { deferred } from '../../test/deferred'

const CHAIN: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana Devnet',
  escrow_address: 'PROGRAM',
  assets: [],
}

beforeEach(() => {
  useChainRegistryStore.setState({ chains: null, status: 'idle' })
})

describe('fetch', () => {
  it('loads the registry and marks ready', async () => {
    mockChainsRequest.mockResolvedValue({ data: [CHAIN] })
    await useChainRegistryStore.getState().fetch()
    expect(useChainRegistryStore.getState()).toMatchObject({ chains: [CHAIN], status: 'ready' })
  })

  it('joins an in-flight fetch instead of stacking a second request', async () => {
    const d = deferred<{ data: ChainRegistryEntry[] }>()
    mockChainsRequest.mockReturnValue(d.promise)
    const first = useChainRegistryStore.getState().fetch()
    const second = useChainRegistryStore.getState().fetch()
    d.resolve({ data: [CHAIN] })
    await Promise.all([first, second])
    expect(mockChainsRequest).toHaveBeenCalledTimes(1)
  })

  it('an EMPTY payload is error (broken deployment), never "loaded"', async () => {
    mockChainsRequest.mockResolvedValue({ data: [] })
    await useChainRegistryStore.getState().fetch()
    expect(useChainRegistryStore.getState()).toMatchObject({ chains: null, status: 'error' })
  })

  it('a failed refresh over a hydrated registry keeps the data and stays ready', async () => {
    useChainRegistryStore.setState({ chains: [CHAIN], status: 'ready' })
    mockChainsRequest.mockRejectedValue(new Error('down'))
    await useChainRegistryStore.getState().fetch()
    expect(useChainRegistryStore.getState()).toMatchObject({ chains: [CHAIN], status: 'ready' })
  })

  it('never flashes loading over a registry already serving good data', async () => {
    useChainRegistryStore.setState({ chains: [CHAIN], status: 'ready' })
    const d = deferred<{ data: ChainRegistryEntry[] }>()
    mockChainsRequest.mockReturnValue(d.promise)
    const pending = useChainRegistryStore.getState().fetch()
    expect(useChainRegistryStore.getState().status).toBe('ready') // not 'loading'
    d.resolve({ data: [CHAIN] })
    await pending
  })

  it('a cold failure lands on error so the screen can offer a retry', async () => {
    mockChainsRequest.mockRejectedValue(new Error('down'))
    await useChainRegistryStore.getState().fetch()
    expect(useChainRegistryStore.getState().status).toBe('error')
  })
})

describe('ensureLoaded', () => {
  it('no-ops when the registry is already usable', async () => {
    useChainRegistryStore.setState({ chains: [CHAIN], status: 'ready' })
    await useChainRegistryStore.getState().ensureLoaded()
    expect(mockChainsRequest).not.toHaveBeenCalled()
  })

  it('fetches (and recovers) when a previous attempt failed', async () => {
    useChainRegistryStore.setState({ chains: null, status: 'error' })
    mockChainsRequest.mockResolvedValue({ data: [CHAIN] })
    await useChainRegistryStore.getState().ensureLoaded()
    expect(useChainRegistryStore.getState().status).toBe('ready')
  })
})

describe('selectChainById', () => {
  it('finds by CAIP id; null for unloaded or unknown', () => {
    expect(selectChainById([CHAIN], 'solana:devnet')).toEqual(CHAIN)
    expect(selectChainById([CHAIN], 'eip155:8453')).toBeNull()
    expect(selectChainById(null, 'solana:devnet')).toBeNull()
  })
})
