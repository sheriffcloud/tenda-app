import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { api } from '@/api/client'
import { isRegistryUsable } from '@tenda/shared'
import type { ChainRegistryEntry } from '@tenda/shared'

// Versioned: bump when ChainRegistryEntry gains REQUIRED fields, so a stale
// persisted snapshot (older shape) is ignored instead of rehydrating as the
// new type with undefined fields. v2 = escrow_address + supports_permit.
//
// Persisted in AsyncStorage, NOT SecureStore: the registry is public chain
// facts (nothing secret to protect), and Android's expo-secure-store rejects
// values over 2048 bytes — the snapshot was 1747 bytes with four chains, so
// roughly one more chain would have made every persist fail silently and
// frozen the fast first paint at the last pre-cap registry.
const STORAGE_KEY = 'chain_registry_v2'
// The pre-AsyncStorage location; read once as a migration, then deleted.
const LEGACY_SECURE_STORE_KEY = 'chain_registry_v2'

/**
 * Lifecycle of the registry load, mirroring `walletsStatus` in the auth store
 * so both of the wallet screen's dependencies report themselves the same way.
 * It expresses what `chains === null` alone could not: "not fetched yet" versus
 * "fetched and failed". The screen owes a skeleton to the first and a retry to
 * the second — it used to show a settled `0.00` for both.
 */
export type ChainRegistryStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Cached enabled-chain registry (id, namespace, display name, and each asset's
 * symbol/decimals/token_address). The SINGLE client-side source of token
 * addresses, the wallet balance readers consume it so a USDC address change is
 * a server config/seed edit, never an app change. Persisted to AsyncStorage for
 * a fast first paint; refreshed from `/v1/platform/chains` on app start.
 */
interface ChainRegistryState {
  /** null until loaded from cache or network. */
  chains: ChainRegistryEntry[] | null
  status: ChainRegistryStatus
  loadPersisted: () => Promise<void>
  /**
   * Fetch fresh; de-duped + cached. Never throws (keeps the last good value).
   * Callers: useAppReady once per launch, and the wallet screen's
   * pull-to-refresh — the one user gesture that must refresh a registry that
   * is STALE but usable, which `ensureLoaded` deliberately will not.
   */
  fetch: () => Promise<void>
  /**
   * Fetch only when there is nothing usable to read, joining an in-flight
   * request rather than stacking another. The recovery path for consumers that
   * mount long after startup: before it existed, one cold-start blip left
   * every balance read with zero chains to scan for the WHOLE session, which
   * the wallet screen rendered as a confident `0.00`, and only a force-close
   * recovered it.
   */
  ensureLoaded: () => Promise<void>
}

let inflight: Promise<void> | null = null



export const useChainRegistryStore = create<ChainRegistryState>((set, get) => ({
  chains: null,
  status: 'idle',

  loadPersisted: async () => {
    try {
      let raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw === null) {
        // One-time migration from the SecureStore era. Written through to
        // AsyncStorage immediately: the legacy copy is deleted below, so
        // without the write-through a failed launch fetch on the next launch
        // would find NEITHER copy — the exact no-registry session this store
        // exists to prevent.
        raw = await SecureStore.getItemAsync(LEGACY_SECURE_STORE_KEY)
        if (raw !== null) await AsyncStorage.setItem(STORAGE_KEY, raw)
      }
      // Fire-and-forget: reclaiming the keystore slot must not gate (or fail)
      // the bootstrap. Reaching this line means AsyncStorage HOLDS the snapshot
      // (or none exists anywhere) — a failed write-through above threw past
      // this delete into the outer catch, keeping the legacy copy for the next
      // launch to migrate. That ordering is load-bearing.
      void SecureStore.deleteItemAsync(LEGACY_SECURE_STORE_KEY).catch(() => {})
      if (!raw) return
      // Don't clobber a fresher network result that already landed.
      if (get().chains === null) {
        const cached = JSON.parse(raw) as ChainRegistryEntry[]
        // Valid JSON is not necessarily OUR shape (an older write, a truncated
        // value): seating a non-array here would hand every consumer a `chains`
        // that cannot be iterated. Let the network answer instead.
        if (!Array.isArray(cached)) return
        // A cached snapshot is a usable first paint, but only a non-empty one is
        // `ready`; leaving an empty cache `idle` keeps ensureLoaded's recovery
        // open instead of declaring a dead registry loaded.
        set({ chains: cached, status: isRegistryUsable(cached) ? 'ready' : 'idle' })
      }
    } catch {
      // Ignore corrupt cache.
    }
  },

  fetch: async () => {
    if (inflight) return inflight

    /**
     * This attempt produced nothing usable — a failed request, or an empty
     * payload, which is a broken deployment rather than a loaded registry.
     * Keep whatever we already had: `error` only when there is no usable
     * fallback, so a failed refresh over a hydrated registry stays invisible.
     */
    const settleWithoutFreshData = () =>
      set((s) => ({ status: isRegistryUsable(s.chains) ? 'ready' : 'error' }))

    // Never flash a skeleton over a registry already serving good data.
    set((s) => (s.status === 'ready' ? {} : { status: 'loading' }))
    inflight = api.platform
      .chains()
      .then(async ({ data }) => {
        if (!isRegistryUsable(data)) {
          // Not persisted either: caching an empty answer would overwrite a good
          // snapshot with a useless one and cost the next launch its fast paint.
          settleWithoutFreshData()
          return
        }
        set({ chains: data, status: 'ready' })
        // Caught HERE, not in the outer catch: a persist failure must not be
        // settled like a fetch failure (the fresh data is already in memory
        // and `ready`), and silence is how the SecureStore 2048-byte cap
        // would have shipped unnoticed — say so where a dev build can see it.
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((err) => {
          if (__DEV__) console.warn('chain-registry: persist failed', err)
        })
      })
      // Never crash a caller on a registry fetch failure (useAppReady awaits it
      // during the splash).
      .catch(settleWithoutFreshData)
      .finally(() => {
        inflight = null
      })
    return inflight
  },

  ensureLoaded: async () => {
    if (isRegistryUsable(get().chains)) return
    await get().fetch()
  },
}))

/**
 * One enabled chain by CAIP-2 id, or null when the registry hasn't loaded yet
 * or doesn't carry it. Pure so both read styles share it: reactive consumers
 * pass the value from `useChainRegistryStore(s => s.chains)`, one-shot ones
 * pass `useChainRegistryStore.getState().chains`.
 */
export function selectChainById(
  chains: ChainRegistryEntry[] | null,
  id: string,
): ChainRegistryEntry | null {
  return chains?.find((c) => c.id === id) ?? null
}
