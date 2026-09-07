import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useChatStore } from '@/stores/chat.store'

const POLL_INTERVAL_MS = 15_000

/**
 * Polls conversations in the background to keep the unread badge current.
 * Pauses automatically when the app is backgrounded.
 *
 * `enabled` lets useInboxRealtime park this loop while the WS connection
 * is healthy (E4: polling is the fallback, not the default).
 */
export function useConversationPolling(enabled = true) {
  const appState = useRef(AppState.currentState)

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    function schedule() {
      timer = setTimeout(run, POLL_INTERVAL_MS)
    }

    async function run() {
      if (cancelled) return
      try {
        await useChatStore.getState().fetchConversations()
      } catch {
        // polling errors are silent, the badge just won't update this cycle
      }
      if (!cancelled) schedule()
    }

    run()

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        if (timer) clearTimeout(timer)
        run()
      } else if (next.match(/inactive|background/)) {
        if (timer) clearTimeout(timer)
      }
      appState.current = next
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      sub.remove()
    }
  }, [enabled])
}
