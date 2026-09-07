/**
 * Chain registry store. The registry is a HARD dependency of every balance
 * read — `readWalletBalances` pairs each wallet against the chains sharing its
 * namespace, so an unloaded registry yields zero pairs and the wallet screen
 * renders a confident `0.00`. It used to be fetched exactly once per launch,
 * with the failure swallowed and nothing retrying it, so a single cold-start
 * blip stuck for the whole session and only a force-close recovered it.
 *
 * These tests pin the recovery path (`ensureLoaded`), the status lifecycle the
 * screen branches on, and the rule that a failed refresh never downgrades a
 * registry that is already serving good data.
 */
import * as SecureStore from 'expo-secure-store'
import type { ChainRegistryEntry } from '@tenda/shared'

const mockChainsRequest = jest.fn()
jest.mock('@/api/client', () => ({
  api: { platform: { chains: () => mockChainsRequest() } },
}))

import {
  isRegistryUsable,
  selectChainById,
  useChainRegistryStore,
} from '@/stores/chain-registry.store'

const STORAGE_KEY = 'chain_registry_v2'
const getItem = SecureStore.getItemAsync as jest.Mock
const setItem = SecureStore.setItemAsync as jest.Mock

const SOLANA: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana',
  escrow_address: 'Esc111',
  assets: [
    {
      id: 'USDC_SOL',
      symbol: 'USDC',
      decimals: 6,
      is_stable: true,
      token_address: 'Usdc111',
      supports_permit: false,
    },
  ],
}

const state = () => useChainRegistryStore.getState()

beforeEach(async () => {
  useChainRegistryStore.setState({ chains: null, status: 'idle' })
  mockChainsRequest.mockReset().mockResolvedValue({ data: [SOLANA] })
  getItem.mockClear()
  setItem.mockClear()
  await SecureStore.deleteItemAsync(STORAGE_KEY)
})

// ─── isRegistryUsable ─────────────────────────────────────────────────────────

describe('isRegistryUsable', () => {
  it('rejects null and empty, accepts a populated registry', () => {
    expect(isRegistryUsable(null)).toBe(false)
    // An empty array is the trap: `!== null` would call it loaded forever, and
    // downstream it is indistinguishable from a wallet holding nothing.
    expect(isRegistryUsable([])).toBe(false)
    expect(isRegistryUsable([SOLANA])).toBe(true)
  })
})

// ─── fetch ────────────────────────────────────────────────────────────────────

describe('fetch', () => {
  it('stores, persists and marks ready on success', async () => {
    await state().fetch()

    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify([SOLANA]))
  })

  it('reports error (not a silent empty) when the request fails', async () => {
    mockChainsRequest.mockRejectedValue(new Error('offline'))

    await state().fetch()

    expect(state().chains).toBeNull()
    expect(state().status).toBe('error')
  })

  it('never throws, so a startup bootstrap cannot be wedged by it', async () => {
    mockChainsRequest.mockRejectedValue(new Error('offline'))
    await expect(state().fetch()).resolves.toBeUndefined()
  })

  it('treats an EMPTY payload as an error, not as a loaded registry', async () => {
    mockChainsRequest.mockResolvedValue({ data: [] })

    await state().fetch()

    expect(state().status).toBe('error')
    // Never cached: a good snapshot must not be replaced by a useless one.
    expect(setItem).not.toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify([]))
  })

  it('an empty payload does not overwrite a registry that was already good', async () => {
    await state().fetch()
    setItem.mockClear()
    mockChainsRequest.mockResolvedValue({ data: [] })

    await state().fetch()

    // Same rule as a failed request: stale-but-usable beats blank.
    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('keeps serving good data when a later refresh fails', async () => {
    await state().fetch()
    mockChainsRequest.mockRejectedValue(new Error('offline'))

    await state().fetch()

    // Stale beats blank: the screen keeps rendering real balances.
    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
  })

  it('does not flash `loading` over a registry already ready', async () => {
    await state().fetch()
    let statusDuringRefetch: string | undefined
    mockChainsRequest.mockImplementation(() => {
      statusDuringRefetch = state().status
      return Promise.resolve({ data: [SOLANA] })
    })

    await state().fetch()

    expect(statusDuringRefetch).toBe('ready')
  })

  it('de-duplicates concurrent callers into ONE request', async () => {
    await Promise.all([state().fetch(), state().fetch(), state().fetch()])
    expect(mockChainsRequest).toHaveBeenCalledTimes(1)
  })

  it('releases the in-flight lock after a failure, so a retry can still fire', async () => {
    mockChainsRequest.mockRejectedValueOnce(new Error('offline'))
    await state().fetch()

    await state().fetch()

    expect(mockChainsRequest).toHaveBeenCalledTimes(2)
    expect(state().status).toBe('ready')
  })
})

// ─── ensureLoaded (the recovery path) ─────────────────────────────────────────

describe('ensureLoaded', () => {
  it('fetches when the registry has never loaded', async () => {
    await state().ensureLoaded()

    expect(mockChainsRequest).toHaveBeenCalledTimes(1)
    expect(state().chains).toEqual([SOLANA])
  })

  it('recovers a session whose only fetch failed — the reported bug', async () => {
    mockChainsRequest.mockRejectedValueOnce(new Error('cold start blip'))
    await state().fetch() // what useAppReady does, once, at launch
    expect(state().status).toBe('error')

    // Re-entering the wallet screen used to change nothing here; only a
    // force-close repopulated the registry.
    await state().ensureLoaded()

    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
  })

  it('is a no-op once the registry is usable, so focus cannot spam the API', async () => {
    await state().fetch()
    mockChainsRequest.mockClear()

    await state().ensureLoaded()
    await state().ensureLoaded()

    expect(mockChainsRequest).not.toHaveBeenCalled()
  })

  it('still retries a registry that hydrated EMPTY from cache', async () => {
    // `!== null` would treat this as loaded and never recover.
    useChainRegistryStore.setState({ chains: [], status: 'idle' })

    await state().ensureLoaded()

    expect(mockChainsRequest).toHaveBeenCalledTimes(1)
    expect(state().chains).toEqual([SOLANA])
  })

  it('joins an in-flight fetch instead of stacking a second one', async () => {
    const both = Promise.all([state().fetch(), state().ensureLoaded()])
    await both
    expect(mockChainsRequest).toHaveBeenCalledTimes(1)
  })
})

// ─── loadPersisted ────────────────────────────────────────────────────────────

describe('loadPersisted', () => {
  it('hydrates a cached snapshot as ready (fast first paint)', async () => {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify([SOLANA]))

    await state().loadPersisted()

    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
  })

  it('leaves an EMPTY cached snapshot idle so ensureLoaded still recovers it', async () => {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify([]))

    await state().loadPersisted()

    expect(state().status).toBe('idle')
    await state().ensureLoaded()
    expect(state().chains).toEqual([SOLANA])
  })

  it('does not clobber a fresher network result that already landed', async () => {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify([]))
    await state().fetch()

    await state().loadPersisted()

    expect(state().chains).toEqual([SOLANA])
  })

  it('ignores a corrupt cache rather than crashing the bootstrap', async () => {
    await SecureStore.setItemAsync(STORAGE_KEY, '{not json')

    await expect(state().loadPersisted()).resolves.toBeUndefined()
    expect(state().chains).toBeNull()
  })

  it('ignores valid JSON that is not our shape, rather than seating a non-array', async () => {
    // An older write or a truncated value parses fine but cannot be iterated;
    // `chains` must stay null so the network answer is what lands.
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ chains: [SOLANA] }))

    await state().loadPersisted()

    expect(state().chains).toBeNull()
    expect(state().status).toBe('idle')
  })

  it('is a no-op with no cache at all (fresh install)', async () => {
    await state().loadPersisted()

    expect(state().chains).toBeNull()
    expect(state().status).toBe('idle')
  })
})

// ─── selectChainById ──────────────────────────────────────────────────────────

describe('selectChainById', () => {
  it('finds a chain, and answers null for an unloaded registry or an unknown id', () => {
    expect(selectChainById([SOLANA], 'solana:devnet')).toEqual(SOLANA)
    expect(selectChainById([SOLANA], 'eip155:8453')).toBeNull()
    expect(selectChainById(null, 'solana:devnet')).toBeNull()
  })
})

// ─── persistence failure ──────────────────────────────────────────────────────

describe('a failing cache write', () => {
  it('does not discard data already in memory', async () => {
    // The persist rejection lands in the same catch as a request failure; the
    // fresh registry is already applied, so it must stay `ready`.
    setItem.mockRejectedValueOnce(new Error('keystore full'))

    await state().fetch()

    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
  })
})
