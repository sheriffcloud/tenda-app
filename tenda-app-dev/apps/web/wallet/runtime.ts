/**
 * Lazy, browser-only entry to the Reown runtime — web's SSR boundary.
 *
 * Admin renders wagmi hooks, so its boundary is a React provider pair
 * (providers/reown/boundary.tsx). Web drives the wallet imperatively through
 * the WalletAdapter seam, so the boundary is this loader instead: the heavy
 * wallet libraries enter the JS graph only when something actually calls
 * `loadWalletRuntime()` (a connect click), never on public/SSR pages.
 *
 * `walletConfigured()` is the light availability probe (mobile's
 * `reownConfigured` analogue) — adapters answer `isAvailable()` from it
 * without pulling in any wallet code.
 */
import { reownEnvironment } from './reown/env'
import type { ReownRuntime } from './reown/config'

export type WalletRuntimeState =
  | { status: 'disabled' }
  | { status: 'ready'; runtime: ReownRuntime }

let cached: Promise<WalletRuntimeState> | null = null
let current: ReownRuntime | null = null

/** True when a Reown project id is configured (throws surfaced as false). */
export function walletConfigured(): boolean {
  try {
    return reownEnvironment().enabled
  } catch (error) {
    console.error('[wallet] invalid Reown configuration:', error)
    return false
  }
}

/**
 * Initialize (once) and return the wallet runtime. A rejected initialization
 * is NOT cached — the next call retries, so one flaky load doesn't brick
 * wallet features for the whole session.
 */
export function loadWalletRuntime(): Promise<WalletRuntimeState> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('wallet runtime is browser-only'))
  }
  cached ??= initialize().catch((error: unknown) => {
    cached = null
    throw error
  })
  return cached
}

async function initialize(): Promise<WalletRuntimeState> {
  const environment = reownEnvironment()
  if (!environment.enabled) return { status: 'disabled' }
  const { initReown } = await import('./reown/config')
  current = initReown(environment.projectId, environment.webUrl)
  return { status: 'ready', runtime: current }
}

/**
 * The already-initialized runtime, or null — WITHOUT triggering
 * initialization. For read paths (session restore, disconnect) where "the
 * runtime was never booted" already answers the question: no runtime means
 * no session this page could have.
 */
export function peekWalletRuntime(): ReownRuntime | null {
  return current
}

/** Test seam: forget the cached runtime promise. */
export function resetWalletRuntimeForTests(): void {
  cached = null
  current = null
}
