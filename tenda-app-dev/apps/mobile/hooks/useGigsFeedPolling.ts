import { useCallback, useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useFocusEffect } from 'expo-router'
import {
  GIG_FEED_ACTIVE_RECOVERY_INTERVAL_MS,
  GIG_FEED_EMPTY_RECOVERY_LIMIT,
  GIG_FEED_IDLE_RECOVERY_INTERVAL_MS,
} from '@/features/gig-feed/gig-feed.configuration'

export interface GigsFeedPollingSource {
  /**
   * Page-0 re-read that PRESERVES already-loaded pages, resolving with the
   * fresh server total. The total has to come back through the promise: a
   * `total` prop (or a ref mirroring it) only updates on the NEXT render,
   * one tick after the reload settles, so comparing it here would read the
   * pre-poll value every time and back off unconditionally.
   */
  reload: () => Promise<number>
}

/**
 * Intelligent polling for the gigs feed.
 *
 * - Fetches immediately on tab focus
 * - Runs a slow recovery heartbeat while WebSocket provides normal freshness;
 *   backs off further after consecutive polls with no count change
 * - Pauses when the app backgrounds; resets and resumes on foreground
 * - Stops on blur, restarts fresh on re-focus
 *
 * Two things are load-bearing now that the feed paginates:
 *   1. it polls via `reload`, NOT a page-0 replace — a timer tick must never
 *      collapse the pages the user has scrolled through;
 *   2. the back-off signal is the server `total`, not the loaded row count.
 *      Row count changes whenever the user pages, which would keep the poll
 *      pinned at its fast interval forever.
 */
export function useGigsFeedPolling({ reload }: GigsFeedPollingSource) {
  const pollTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emptyPollCount = useRef(0)
  const isFetching     = useRef(false)
  const isFocused      = useRef(false)
  const isAppActive    = useRef(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  )
  /** Total observed at the last poll; null until the first one completes. */
  const lastTotal      = useRef<number | null>(null)

  // Read the latest callback inside the timer without re-arming it each render.
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  const clearTimer = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  const scheduleNextPoll = useCallback(() => {
    clearTimer()
    if (!isFocused.current || !isAppActive.current) return
    const delay = emptyPollCount.current >= GIG_FEED_EMPTY_RECOVERY_LIMIT
      ? GIG_FEED_IDLE_RECOVERY_INTERVAL_MS
      : GIG_FEED_ACTIVE_RECOVERY_INTERVAL_MS

    pollTimer.current = setTimeout(async () => {
      if (isFetching.current || !isFocused.current || !isAppActive.current) {
        scheduleNextPoll()
        return
      }
      isFetching.current = true
      try {
        const total = await reloadRef.current()
        // First poll of a focus session has no baseline — treat it as "no
        // change" so a quiet feed still reaches the idle interval on schedule.
        emptyPollCount.current =
          lastTotal.current === null || total === lastTotal.current
            ? emptyPollCount.current + 1
            : 0
        lastTotal.current = total
      } catch {
        // The list owns its visible error state. Keep the recovery loop alive
        // so a transient network failure cannot permanently stop polling.
      } finally {
        isFetching.current = false
        scheduleNextPoll()
      }
    }, delay)
  }, [clearTimer])

  // Pause polling when the app goes to background; reset + resume on foreground
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      isAppActive.current = state === 'active'
      if (state === 'active') {
        emptyPollCount.current = 0
        lastTotal.current = null
        scheduleNextPoll()
      } else {
        clearTimer()
      }
    }
    const sub = AppState.addEventListener('change', handleAppState)
    return () => sub.remove()
  }, [clearTimer, scheduleNextPoll])

  // Start on focus, stop on blur. The first page is loaded by the list
  // controller's own mount effect, so focus only refreshes what's there —
  // re-fetching here as well would double every tab entry.
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true
      emptyPollCount.current = 0
      lastTotal.current = null
      scheduleNextPoll()

      return () => {
        isFocused.current = false
        clearTimer()
      }
    }, [clearTimer, scheduleNextPoll]),
  )
}
