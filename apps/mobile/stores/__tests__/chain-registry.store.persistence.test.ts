/**
 * Chain registry persistence: the fast-first-paint snapshot, its move from
 * SecureStore to AsyncStorage, and what happens to a SUPERSEDED snapshot.
 *
 * The move exists because the snapshot is public chain facts sitting in a
 * store with an Android 2048-byte VALUE CAP: at 1747 bytes with four chains,
 * roughly one more chain would have made every persist fail silently and
 * frozen the paint at the last pre-cap registry.
 *
 * The snapshot key is VERSIONED against the wire shape. v3 (#132/#137) added
 * four required fields, v4 (#139) a fifth and v5 (#148) a sixth, so an older
 * snapshot — in either store — must never hydrate: it would rehydrate as the
 * new type with undefined fields, which is the exact failure the version
 * exists to prevent. It is reclaimed instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

const mockChainsRequest = jest.fn()
jest.mock('@/api/client', () => ({
  api: { platform: { chains: () => mockChainsRequest() } },
}))

import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { SOLANA } from '../__fixtures__/chain-registry'

const STORAGE_KEY = 'chain_registry_v5'
/** The SecureStore era only ever held v2; AsyncStorage held v2, v3 and v4. */
const SUPERSEDED_KEY = 'chain_registry_v2'
const SUPERSEDED_ASYNC_KEYS = ['chain_registry_v2', 'chain_registry_v3', 'chain_registry_v4'] as const

const state = () => useChainRegistryStore.getState()

beforeEach(async () => {
  useChainRegistryStore.setState({ chains: null, status: 'idle' })
  mockChainsRequest.mockReset().mockResolvedValue({ data: [SOLANA] })
  await AsyncStorage.clear()
  await SecureStore.deleteItemAsync(SUPERSEDED_KEY)
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

// ─── a superseded (v2) snapshot ───────────────────────────────────────────

describe('a superseded v2 snapshot', () => {
  // A v2 entry as a v2 launch wrote it — the four v3 fields, the v4 field and
  // the v5 field absent. Built by stripping the current fixture rather than
  // typed as ChainRegistryEntry, because the whole point is that it is NOT one.
  const {
    relayed_funding_available: _r, rpc_url: _u, explorer_url: _e, faucet_url: _f, network_kind: _k, approval_window_seconds: _w,
    ...v2Entry
  } = SOLANA
  const v2 = JSON.stringify([v2Entry])
  // A v3 entry: the four fields present, `network_kind` and the window absent.
  const { network_kind: _kind, approval_window_seconds: _win3, ...v3Entry } = SOLANA
  const v3 = JSON.stringify([v3Entry])
  // A v4 entry: everything but `approval_window_seconds` (#148).
  const { approval_window_seconds: _win4, ...v4Entry } = SOLANA
  const v4 = JSON.stringify([v4Entry])

  // Never READ, not merely never seated. The reclaim runs before the read, so
  // a fallback read of a superseded copy finds nothing and passes every
  // "chains is null" assertion by accident of ordering — measured: a re-added
  // SecureStore write-through and a v2 AsyncStorage fallback both survived
  // them. The rule the tests hold is that the key is not consulted at all.
  // The two storage mocks are already jest.fn instances, so their call lists
  // are read directly (a spy on them cannot be restored without wiping their
  // implementations — that broke the sibling test when tried).
  const legacyRead = SecureStore.getItemAsync as jest.Mock
  const asyncRead = AsyncStorage.getItem as jest.Mock

  it('in the SecureStore era is NOT hydrated and is reclaimed — never read, never written through', async () => {
    await SecureStore.setItemAsync(SUPERSEDED_KEY, v2)
    legacyRead.mockClear()

    await state().loadPersisted()

    expect(legacyRead).not.toHaveBeenCalledWith(SUPERSEDED_KEY)
    // The old shape would have seated `relayed_funding_available: undefined`
    // under a type that says boolean. The network answer lands instead.
    expect(state().chains).toBeNull()
    expect(state().status).toBe('idle')
    expect(await SecureStore.getItemAsync(SUPERSEDED_KEY)).toBeNull()
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('in AsyncStorage — v2, v3 or v4 — is NOT hydrated and is removed, never read', async () => {
    await AsyncStorage.setItem(SUPERSEDED_ASYNC_KEYS[0], v2)
    await AsyncStorage.setItem(SUPERSEDED_ASYNC_KEYS[1], v3)
    await AsyncStorage.setItem(SUPERSEDED_ASYNC_KEYS[2], v4)
    asyncRead.mockClear()

    await state().loadPersisted()

    for (const key of SUPERSEDED_ASYNC_KEYS) {
      expect(asyncRead).not.toHaveBeenCalledWith(key)
      expect(await AsyncStorage.getItem(key)).toBeNull()
    }
    expect(state().chains).toBeNull()
  })

  it('never shadows a current snapshot, and is reclaimed regardless', async () => {
    await SecureStore.setItemAsync(SUPERSEDED_KEY, v2)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([SOLANA]))

    await state().loadPersisted()

    expect(state().chains).toEqual([SOLANA])
    expect(state().status).toBe('ready')
    expect(await SecureStore.getItemAsync(SUPERSEDED_KEY)).toBeNull()
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
