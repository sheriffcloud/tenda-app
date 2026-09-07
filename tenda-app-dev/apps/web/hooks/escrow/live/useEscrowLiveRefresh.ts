/**
 * WS-first detail convergence with reconnect, tab-return and polling
 * recovery — web port of apps/mobile/hooks/escrow-live/useEscrowLiveRefresh.
 * Platform substitutions only: AppState → the visibility shim, NetInfo →
 * useOnlineStatus, and screen focus → mount (a web detail unmounts when
 * navigated away, so the mobile blur teardown is the unmount cleanup).
 *
 * The visibility/online transitions are bridged into the ONE main effect
 * through a controls ref (the useConversationPolling pattern) so the WS
 * subscription survives tab-hide/show instead of resubscribing per flip.
 */
import { useEffect, useRef } from 'react'
import { ESCROW_STATUS_SETTLEMENT, type EscrowStatus } from '@tenda/shared'
import { subscribeEscrowChannel, useRealtimeStore } from '@/stores/realtime.store'
import { useDocumentVisibility, isDocumentVisible } from '@/hooks/connectivity/useDocumentVisibility'
import { useOnlineStatus } from '@/hooks/connectivity/useOnlineStatus'
import {
  ESCROW_EVENT_DEBOUNCE_MS,
  ESCROW_FOCUSED_POLL_MS,
  createRefreshCoordinator,
} from '@tenda/shared'

export function useEscrowLiveRefresh(
  escrowId: string | undefined,
  refresh: () => void | Promise<void>,
  status: EscrowStatus,
): void {
  // Latest callback without resubscribing (assigned in an effect —
  // react-hooks/refs forbids render-time ref writes).
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  })

  const controls = useRef<{ setActive(next: boolean): void; setOnline(next: boolean): void } | null>(null)
  useDocumentVisibility((visible) => controls.current?.setActive(visible))
  const isOnline = useOnlineStatus()
  useEffect(() => {
    controls.current?.setOnline(isOnline)
  }, [isOnline])

  useEffect(() => {
    if (!escrowId) return
    let active = isDocumentVisible()
    let online = typeof navigator === 'undefined' ? true : navigator.onLine
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

    const clearTimers = () => {
      if (pollTimer !== null) clearTimeout(pollTimer)
      if (eventTimer !== null) clearTimeout(eventTimer)
      pollTimer = null
      eventTimer = null
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
    controls.current = {
      setActive: (next) => {
        const wasActive = active
        active = next
        if (active && !wasActive) {
          coordinator.request()
          schedulePoll()
        } else if (!active) {
          clearTimers()
        }
      },
      setOnline: (next) => {
        const wasOnline = online
        online = next
        if (online && !wasOnline) {
          coordinator.request()
          schedulePoll()
        } else if (!online) {
          clearTimers()
        }
      },
    }
    schedulePoll()

    return () => {
      clearTimers()
      coordinator.stop()
      unsubscribeEscrow()
      unsubscribeConnection()
      controls.current = null
    }
  }, [escrowId, status])
}
