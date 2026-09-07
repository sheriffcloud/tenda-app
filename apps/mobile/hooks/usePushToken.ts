import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { registerDeviceToken, removeDeviceToken } from '@/lib/notifications'

/**
 * Push token lifecycle: register on login / session restore, drop on logout.
 *
 * Deliberately never asks for permission. It used to prompt whenever the status
 * was `undetermined`, which fired the system dialog cold at app open and spent
 * iOS's one-shot prompt before the user had any context for it. The ask now
 * belongs to NotificationPrimerHost, behind an explicit tap, and this hook only
 * registers a token once permission already exists.
 */
export function usePushToken() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      if (tokenRef.current !== null) {
        void removeDeviceToken(tokenRef.current)
        tokenRef.current = null
      }
      return
    }

    void registerDeviceToken().then((token) => {
      tokenRef.current = token
    })
  }, [isAuthenticated])
}
