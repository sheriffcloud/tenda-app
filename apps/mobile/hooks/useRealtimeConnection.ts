import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useAuthStore } from '@/stores/auth.store'
import { ws } from '@/lib/ws'

/**
 * Keeps the WS connection's lifecycle tied to the session: connect while
 * authenticated, tear down on logout. Foregrounding re-invokes connect()
 * (idempotent) to revive a socket the OS killed in the background.
 */
export function useRealtimeConnection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) {
      ws.disconnect()
      return
    }
    ws.connect()
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') ws.connect()
    })
    return () => {
      sub.remove()
      ws.disconnect()
    }
  }, [isAuthenticated])
}
