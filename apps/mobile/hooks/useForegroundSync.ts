import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { usePendingSyncStore } from '@/stores/pending-sync.store'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useNotificationPermissionStore } from '@/stores/notification-permission.store'

/**
 * Replays pending-sync items, refreshes exchange rates and re-reads
 * notification permission whenever the app returns to the foreground.
 * fetchRates' internal TTL check prevents unnecessary network calls.
 *
 * The permission re-read belongs here because the only way it can change
 * outside the app is via the OS Settings app, which necessarily backgrounds
 * us first, so this edge is complete coverage.
 */
export function useForegroundSync() {
  const appState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current !== 'active' && next === 'active') {
        usePendingSyncStore.getState().replayAll()
        useExchangeRateStore.getState().fetchRates()
        void useNotificationPermissionStore.getState().refresh()
      }
      appState.current = next
    })
    return () => sub.remove()
  }, [])
}
