/**
 * Chain registry persistence: the fast-first-paint snapshot, its move from
 * SecureStore to AsyncStorage, and the one-time migration between them.
 *
 * The move exists because the snapshot is public chain facts sitting in a
 * store with an Android 2048-byte VALUE CAP: at 1747 bytes with four chains,
 * roughly one more chain would have made every persist fail silently and
 * frozen the paint at the last pre-cap registry. The migration write-through
 * matters because the legacy copy is deleted — without it, a failed launch
 * fetch on the next launch would find neither copy.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

const mockChainsRequest = jest.fn()
jest.mock('@/api/client', () => ({
  api: { platform: { chains: () => mockChainsRequest() } },
}))

import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { SOLANA } from '../__fixtures__/chain-registry'

const STORAGE_KEY = 'chain_registry_v2'

const state = () => useChainRegistryStore.getState()

beforeEach(async () => {
  useChainRegistryStore.setState({ chains: null, status: 'idle' })
  mockChainsRequest.mockReset().mockResolvedValue({ data: [SOLANA] })
  await AsyncStorage.clear()
  await SecureStore.deleteItemAsync(STORAGE_KEY)
})

describe('loadPersisted', () => {
  it('hydrates a cached snapshot as ready (fast first paint)', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([SOLANA]))

    await state().loadPersisted()

    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
  })

  it('leaves an EMPTY cached snapshot idle so ensureLoaded still recovers it', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]))

    await state().loadPersisted()

    expect(state().status).toBe('idle')
    await state().ensureLoaded()
    expect(state().chains).toEqual([SOLANA])
  })

  it('does not clobber a fresher network result that already landed', async () => {
    await state().fetch()
    // The snapshot must DIFFER from what fetch persisted, or this test cannot
    // tell the guard from no guard at all: fetch writes [SOLANA] to the same
    // key, so re-seating the cache would be invisible. (The original version
    // seeded before the fetch and was decorative for exactly that reason —
    // caught by mutation.)
    const stale = [{ ...SOLANA, display_name: 'Stale Solana' }]
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stale))

    await state().loadPersisted()

    expect(state().chains).toEqual([SOLANA])
  })

  it('ignores a corrupt cache rather than crashing the bootstrap', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not json')

    await expect(state().loadPersisted()).resolves.toBeUndefined()
    expect(state().chains).toBeNull()
  })

  it('ignores valid JSON that is not our shape, rather than seating a non-array', async () => {
    // An older write or a truncated value parses fine but cannot be iterated;
    // `chains` must stay null so the network answer is what lands.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ chains: [SOLANA] }))

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

// ─── SecureStore → AsyncStorage migration ─────────────────────────────────────

describe('the legacy SecureStore snapshot', () => {
  it('migrates: hydrates, is written through to AsyncStorage, and is deleted', async () => {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify([SOLANA]))

    await state().loadPersisted()

    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
    // Write-through: the legacy copy is gone after this, so the snapshot must
    // already live in the new store or a failed launch fetch next session
    // would find neither.
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify([SOLANA]))
    expect(await SecureStore.getItemAsync(STORAGE_KEY)).toBeNull()
  })

  it('never shadows an AsyncStorage snapshot, and is deleted regardless', async () => {
    const legacy = [{ ...SOLANA, display_name: 'Old Solana' }]
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(legacy))
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([SOLANA]))

    await state().loadPersisted()

    expect(state().chains).toEqual([SOLANA])
    expect(await SecureStore.getItemAsync(STORAGE_KEY)).toBeNull()
  })
})

// ─── persistence failure ──────────────────────────────────────────────────────

describe('a failing cache write', () => {
  it('does not discard data already in memory, and says so in dev', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'))

    await state().fetch()

    // The fresh registry is already applied, so the session must stay `ready`…
    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
    // …but not SILENTLY: a quiet persist failure is exactly how the
    // SecureStore size cap would have shipped unnoticed.
    expect(warn).toHaveBeenCalledWith('chain-registry: persist failed', expect.any(Error))
    warn.mockRestore()
  })
})
