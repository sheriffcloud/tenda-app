/**
 * Cross-tab session sync (stage-2 DoD: logout in tab A signs out tab B).
 * The `storage` event only fires in OTHER tabs, which is exactly the seam:
 * token removed elsewhere → drop local state; token appeared/changed elsewhere
 * → adopt it by re-running the bootstrap.
 *
 * Its own module since the #45 re-audit: guarding auth.store's five in-flight
 * writers pushed that file past the 300-line rule, and this listener is the one
 * piece of it that is not the store — it holds no state, it reacts to a DOM
 * event and drives the store through its public surface.
 */
import { JWT_TOKEN_KEY } from '@/lib/storage'
import { clearAccountState } from '@/lib/account-state'
import { SIGNED_OUT, useAuthStore } from '@/stores/auth.store'

export function initCrossTabAuthSync(): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== JWT_TOKEN_KEY) return
    // The SECOND way an account changes under a live tab, and the one #25
    // found unguarded: `logout` never runs here, so without this the tab keeps
    // every row the local sign-out would have dropped. Cleared on both edges —
    // a token removed elsewhere is a sign-out, and a token CHANGED elsewhere
    // is a different account, which is the worse of the two.
    clearAccountState()
    if (event.newValue === null) {
      useAuthStore.setState({ ...SIGNED_OUT, isLoading: false })
    } else {
      void useAuthStore.getState().loadSession()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
