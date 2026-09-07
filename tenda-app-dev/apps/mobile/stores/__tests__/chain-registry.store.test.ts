/**
 * Chain registry store. The registry is a HARD dependency of every balance
 * read — `readWalletBalances` pairs each wallet against the chains sharing its
 * namespace, so an unloaded registry yields zero pairs and the wallet screen
 * renders a confident `0.00`. It used to be fetched exactly once per launch,
 * with the failure swallowed and nothing retrying it, so a single cold-start
 * blip stuck for the whole session and only a force-close recovered it.
 *
 * These tests pin the recovery paths (`ensureLoaded` for an UNUSABLE registry,
 * `fetch` for a stale-but-usable one — pull-to-refresh), the status lifecycle
 * the screen branches on, and the rule that a failed refresh never downgrades
 * a registry that is already serving good data. Persistence and the
 * SecureStore→AsyncStorage migration live in
 * chain-registry.store.persistence.test.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

const mockChainsRequest = jest.fn()
jest.mock('@/api/client', () => ({
  api: { platform: { chains: () => mockChainsRequest() } },
}))

import { isRegistryUsable } from '@tenda/shared'
import { selectChainById, useChainRegistryStore } from '@/stores/chain-registry.store'
import { GALILEO, SOLANA } from '../__fixtures__/chain-registry'

const STORAGE_KEY = 'chain_registry_v2'
const setItem = AsyncStorage.setItem as jest.Mock

const state = () => useChainRegistryStore.getState()

beforeEach(async () => {
  useChainRegistryStore.setState({ chains: null, status: 'idle' })
  mockChainsRequest.mockReset().mockResolvedValue({ data: [SOLANA] })
  setItem.mockClear()
  ;(SecureStore.setItemAsync as jest.Mock).mockClear()
  await AsyncStorage.clear()
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
  it('stores, persists (AsyncStorage, never SecureStore) and marks ready', async () => {
    await state().fetch()

    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify([SOLANA]))
    // The registry left SecureStore for its Android 2048-byte value cap — a
    // write landing there again would put the snapshot one chain from
    // silently failing every persist.
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
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

  it('REPLACES a stale-but-usable registry — the pull-to-refresh recovery path', async () => {
    // The reported bug's shape: a pre-0G snapshot is "usable", so ensureLoaded
    // rightly no-ops on it — recovering the missing chain in-app needs a
    // caller that fetches unconditionally, and this is that caller.
    await state().fetch()
    expect(state().chains).toEqual([SOLANA])
    mockChainsRequest.mockResolvedValue({ data: [SOLANA, GALILEO] })

    await state().fetch()

    expect(state().chains).toEqual([SOLANA, GALILEO])
    expect(setItem).toHaveBeenLastCalledWith(STORAGE_KEY, JSON.stringify([SOLANA, GALILEO]))
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

// ─── ensureLoaded (recovery for consumers that mount later) ───────────────────

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

// ─── selectChainById ──────────────────────────────────────────────────────────

describe('selectChainById', () => {
  it('finds a chain, and answers null for an unloaded registry or an unknown id', () => {
    expect(selectChainById([SOLANA], 'solana:devnet')).toEqual(SOLANA)
    expect(selectChainById([SOLANA], 'eip155:8453')).toBeNull()
    expect(selectChainById(null, 'solana:devnet')).toBeNull()
  })
})
