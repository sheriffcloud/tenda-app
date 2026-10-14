/**
 * Web port of apps/mobile/hooks/useRealtimeConnection.ts. Keeps the WS
 * connection's lifecycle tied to the session: connect while authenticated,
 * tear down on logout. The mobile AppState 'active' re-connect becomes the
 * documentvisibility shim: returning to a visible tab re-invokes connect()
 * (idempotent) to revive a socket the browser throttled or dropped while
 * the tab was hidden.
 */
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { ws } from '@/lib/ws'
import { useDocumentVisibility } from '@/hooks/connectivity/useDocumentVisibility'

export function useRealtimeConnection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useDocumentVisibility((visible) => {
    // getState(), not the subscribed value: the callback must see the auth
    // state at event time, not the render it was created in.
    if (visible && useAuthStore.getState().isAuthenticated) ws.connect()
  })

  useEffect(() => {
    if (!isAuthenticated) {
      ws.disconnect()
      return
    }
    ws.connect()
    return () => ws.disconnect()
  }, [isAuthenticated])
}
