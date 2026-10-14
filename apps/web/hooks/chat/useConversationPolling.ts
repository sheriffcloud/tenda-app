/**
 * Web port of apps/mobile/hooks/useConversationPolling.ts — polls the
 * conversations list to keep the unread badge current, pausing while the
 * tab is hidden (the AppState pause/resume becomes the visibility shim).
 *
 * `enabled` lets useInboxRealtime park this loop while the WS connection
 * is healthy (E4: polling is the fallback, not the default).
 */
import { useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chat.store'
import { useDocumentVisibility, isDocumentVisible } from '@/hooks/connectivity/useDocumentVisibility'

const POLL_INTERVAL_MS = 15_000

export function useConversationPolling(enabled = true) {
  // The run/schedule closures live per-effect; the visibility callback needs
  // the CURRENT effect's controls, so they're bridged through a ref.
  const controls = useRef<{ pause: () => void; resume: () => void } | null>(null)

  useDocumentVisibility((visible) => {
    if (visible) controls.current?.resume()
    else controls.current?.pause()
  })

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    function schedule() {
      // A run that was in flight when the tab hid must NOT re-arm the loop
      // (web addition: mobile gets this pause free from background JS
      // suspension). resume() restarts it when the tab returns.
      if (!isDocumentVisible()) return
      // Clear before arming: when resume()'s run overlaps a fetch that was
      // in flight across a hide/show, BOTH completions schedule — without
      // this clear the second one would start a permanent parallel chain.
      if (timer) clearTimeout(timer)
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

    controls.current = {
      pause: () => {
        if (timer) clearTimeout(timer)
      },
      resume: () => {
        if (timer) clearTimeout(timer)
        void run()
      },
    }

    if (isDocumentVisible()) void run()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      controls.current = null
    }
  }, [enabled])
}
