import { useSyncExternalStore } from 'react'

/**
 * `navigator.onLine` + online/offline events — web's stand-in for mobile's
 * NetInfo in the transaction monitor. SSR snapshot says online: the value
 * only matters for live progress copy, and a server render has no browser
 * to be offline in.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
