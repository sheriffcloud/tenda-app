import { useEffect, useRef } from 'react'
import { useRealtimeStore } from '@/stores/realtime.store'
import { useNotificationsStore } from '@/stores/notifications.store'

/**
 * Keeps the bell badge current app-wide. Live personal notices arrive over the
 * already-subscribed `user:<id>` WS channel (realtime.store routes them into the
 * store); this hook covers what WS can't: the initial count on mount, and a
 * resync after a reconnect (which also catches broadcast announcements, since
 * those aren't WS-pushed). Mounted once in the tabs layout, beside
 * useInboxRealtime.
 */
export function useNotificationsRealtime() {
  const connected = useRealtimeStore((s) => s.connected)

  useEffect(() => {
    void useNotificationsStore.getState().refreshUnread()
  }, [])

  const wasConnected = useRef(connected)
  useEffect(() => {
    if (connected && !wasConnected.current) {
      void useNotificationsStore.getState().refreshUnread()
    }
    wasConnected.current = connected
  }, [connected])
}
