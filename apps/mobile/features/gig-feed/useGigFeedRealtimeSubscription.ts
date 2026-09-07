import { useCallback, useEffect, useRef } from 'react'
import {
  applyGigFeedEvent,
  type GigFeedState,
  type GigListQuery,
  type GigSummary,
} from '@tenda/shared'
import { subscribeGigFeedChannel, useRealtimeStore } from '@/stores/realtime.store'

export interface GigFeedRealtimeTarget {
  items: GigSummary[]
  applyRealtimeItems(items: GigSummary[]): void
  reconcile(): Promise<boolean>
}

export function useGigFeedRealtimeSubscription(
  target: GigFeedRealtimeTarget,
  query: GigListQuery,
): void {
  const revisionsFromItems = (items: readonly GigSummary[]): Readonly<Record<string, string>> =>
    Object.fromEntries(items.map((gig) => [gig.escrow_id, gig.public_feed_revision]))
  const stateRef = useRef<GigFeedState>({
    items: target.items,
    revisions: revisionsFromItems(target.items),
  })
  const queryRef = useRef(query)
  const targetRef = useRef(target)
  const reconciliationRunningRef = useRef(false)
  const reconciliationPendingRef = useRef(false)
  const mountedRef = useRef(true)
  queryRef.current = query
  targetRef.current = target
  stateRef.current = {
    items: target.items,
    revisions: { ...stateRef.current.revisions, ...revisionsFromItems(target.items) },
  }

  const requestReconciliation = useCallback((): void => {
    if (reconciliationRunningRef.current) {
      reconciliationPendingRef.current = true
      return
    }
    reconciliationRunningRef.current = true
    void (async () => {
      try {
        do {
          reconciliationPendingRef.current = false
          try {
            await targetRef.current.reconcile()
          } catch {
            // The list owns its error state; a later frame/reconnect may retry.
          }
        } while (mountedRef.current && reconciliationPendingRef.current)
      } finally {
        reconciliationRunningRef.current = false
      }
    })()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const unsubscribe = subscribeGigFeedChannel((event) => {
      const result = applyGigFeedEvent({ state: stateRef.current, event, query: queryRef.current })
      if (result.outcome === 'reconciliation_required') {
        requestReconciliation()
        return
      }
      if (result.outcome !== 'applied') return
      stateRef.current = result.state
      targetRef.current.applyRealtimeItems([...result.state.items])
    })
    return () => {
      mountedRef.current = false
      reconciliationPendingRef.current = false
      unsubscribe()
    }
  }, [requestReconciliation])

  useEffect(() => {
    let wasConnected = useRealtimeStore.getState().connected
    return useRealtimeStore.subscribe((next) => {
      if (!wasConnected && next.connected) requestReconciliation()
      wasConnected = next.connected
    })
  }, [requestReconciliation])
}
