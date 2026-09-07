import { create } from 'zustand'
import { isRegistryUsable, type ChainRegistryEntry, type ChainRegistryStatus } from '@tenda/shared'
import { api } from '@/api/client'

/**
 * Cached enabled-chain registry (web port of apps/mobile/stores/
 * chain-registry.store.ts). The SINGLE client-side source of token addresses
 * — the balance readers consume it, so a USDC address change is a server
 * config/seed edit, never an app change.
 *
 * Divergence from mobile (deliberate): no persisted snapshot. Mobile caches
 * to SecureStore for a fast cold-start paint; a web tab's "cold start" is a
 * page load where the one fetch is cheap, and localStorage would add a
 * stale-shape migration concern for no visible win.
 */
interface ChainRegistryState {
  /** null until loaded. */
  chains: ChainRegistryEntry[] | null
  status: ChainRegistryStatus
  /** Fetch fresh; de-duped. Never throws (keeps the last good value). */
  fetch: () => Promise<void>
  /**
   * Fetch only when there is nothing usable to read, joining an in-flight
   * request rather than stacking another — the recovery path for consumers
   * that mount long after startup (mobile's cold-start-blip lesson: an
   * unretried registry failure rendered a confident `0.00` all session).
   */
  ensureLoaded: () => Promise<void>
}

let inflight: Promise<void> | null = null

export const useChainRegistryStore = create<ChainRegistryState>((set, get) => ({
  chains: null,
  status: 'idle',

  fetch: async () => {
    if (inflight) return inflight

    // This attempt produced nothing usable — a failed request, or an empty
    // payload (a broken deployment, not a loaded registry). Keep whatever we
    // already had: `error` only when there is no usable fallback, so a failed
    // refresh over a hydrated registry stays invisible.
    const settleWithoutFreshData = () =>
      set((s) => ({ status: isRegistryUsable(s.chains) ? 'ready' : 'error' }))

    // Never flash a skeleton over a registry already serving good data.
    set((s) => (s.status === 'ready' ? {} : { status: 'loading' }))
    inflight = api.platform
      .chains()
      .then(({ data }) => {
        if (!isRegistryUsable(data)) {
          settleWithoutFreshData()
          return
        }
        set({ chains: data, status: 'ready' })
      })
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
 * One enabled chain by CAIP-2 id, or null when the registry hasn't loaded
 * yet or doesn't carry it. Pure so both read styles share it.
 */
export function selectChainById(
  chains: ChainRegistryEntry[] | null,
  id: string,
): ChainRegistryEntry | null {
  return chains?.find((c) => c.id === id) ?? null
}
