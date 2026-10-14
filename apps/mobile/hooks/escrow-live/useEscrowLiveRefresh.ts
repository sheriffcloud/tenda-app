import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useIsFocused } from '@react-navigation/native'
import { ESCROW_STATUS_SETTLEMENT, type EscrowStatus } from '@tenda/shared'
import { subscribeEscrowChannel, useRealtimeStore } from '@/stores/realtime.store'
import {
  ESCROW_EVENT_DEBOUNCE_MS,
  ESCROW_FOCUSED_POLL_MS,
  createRefreshCoordinator,
} from '@tenda/shared'

export function isAppStateActive(state: AppStateStatus | null): boolean {
  return state !== 'background' && state !== 'inactive'
}

/** WS-first detail convergence with reconnect, foreground and polling recovery. */
export function useEscrowLiveRefresh(
  escrowId: string | undefined,
  refresh: () => void | Promise<void>,
  status: EscrowStatus,
): void {
  const focused = useIsFocused()
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (!escrowId || !focused) return
    // React Native may expose null briefly during startup. Only an explicit
    // inactive/background state should park convergence indefinitely.
    let active = isAppStateActive(AppState.currentState)
    let online = true
    let eventTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    const terminal = status !== 'draft'
      ? ESCROW_STATUS_SETTLEMENT[status] === 'settled'
      : false
    const coordinator = createRefreshCoordinator(() => refreshRef.current())

    const schedulePoll = () => {
      if (terminal || !active || !online || pollTimer !== null) return
      pollTimer = setTimeout(() => {
        pollTimer = null
        coordinator.request()
        schedulePoll()
      }, ESCROW_FOCUSED_POLL_MS)
    }

    const unsubscribeEscrow = subscribeEscrowChannel(escrowId, () => {
      if (!active || !online || eventTimer !== null) return
      eventTimer = setTimeout(() => {
        eventTimer = null
        coordinator.request()
      }, ESCROW_EVENT_DEBOUNCE_MS)
    })
    const unsubscribeConnection = useRealtimeStore.subscribe((next, previous) => {
      if (next.connected && !previous.connected && active && online) coordinator.request()
    })
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      const wasActive = active
      active = next === 'active'
      if (active && !wasActive) {
        coordinator.request()
        schedulePoll()
      } else if (!active) {
        if (pollTimer !== null) clearTimeout(pollTimer)
        if (eventTimer !== null) clearTimeout(eventTimer)
        pollTimer = null
        eventTimer = null
      }
    })
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      const wasOnline = online
      online = state.isConnected !== false && state.isInternetReachable !== false
      if (online && !wasOnline) {
        coordinator.request()
        schedulePoll()
      } else if (!online) {
        if (pollTimer !== null) clearTimeout(pollTimer)
        if (eventTimer !== null) clearTimeout(eventTimer)
        pollTimer = null
        eventTimer = null
      }
    })
    schedulePoll()

    return () => {
      if (eventTimer !== null) clearTimeout(eventTimer)
      if (pollTimer !== null) clearTimeout(pollTimer)
      coordinator.stop()
      unsubscribeEscrow()
      unsubscribeConnection()
      unsubscribeNetwork()
      appStateSubscription.remove()
    }
  }, [escrowId, focused, status])
}
