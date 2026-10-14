/**
 * Platform config (fee tiers, rates) — verbatim port of
 * apps/mobile/stores/platform-config.store.ts. Cached after the first fetch;
 * concurrent callers share one in-flight request.
 */
import { create } from 'zustand'
import { api } from '@/api/client'
import type { PlatformConfig } from '@tenda/shared'

interface PlatformConfigState {
  config: PlatformConfig | null
  loading: boolean
  error: string | null
  /** Fetch config; resolves immediately with cached value if already loaded. */
  fetch: () => Promise<PlatformConfig | null>
}

let inflight: Promise<PlatformConfig | null> | null = null

export const usePlatformConfigStore = create<PlatformConfigState>((set, get) => ({
  config: null,
  loading: false,
  error: null,

  fetch: async () => {
    const cached = get().config
    if (cached) return cached
    if (inflight) return inflight

    set({ loading: true, error: null })
    inflight = api.platform.config()
      .then((cfg) => {
        set({ config: cfg, loading: false })
        return cfg
      })
      .catch((e: unknown) => {
        set({ error: e instanceof Error ? e.message : String(e), loading: false })
        return null
      })
      .finally(() => { inflight = null })

    return inflight
  },
}))
