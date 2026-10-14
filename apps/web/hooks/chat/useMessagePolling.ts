/**
 * Web port of apps/mobile/hooks/useMessagePolling.ts, unchanged: recursive
 * setTimeout (never setInterval — non-overlap is structural, the delay is
 * an idle gap), backing off to a slower interval after 3 consecutive empty
 * polls. Runs only while the caller passes a conversation id — chat's
 * realtime hook passes null while the socket is up (polling is the
 * FALLBACK layer).
 */
import { useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chat.store'
import { isDocumentVisible } from '@/hooks/connectivity/useDocumentVisibility'

const POLL_INTERVAL_MS = 4_000
const POLL_IDLE_MS = 10_000
const EMPTY_POLL_LIMIT = 3

export function useMessagePolling(conversationId: string | null) {
  const { fetchMessages } = useChatStore()

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emptyPollCount = useRef(0)
  const isFetching = useRef(false)

  const scheduleNextPoll = useCallback((convId: string) => {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    const delay = emptyPollCount.current >= EMPTY_POLL_LIMIT ? POLL_IDLE_MS : POLL_INTERVAL_MS

    pollTimer.current = setTimeout(async () => {
      // Hidden tab: skip the fetch but keep the loop armed — web addition,
      // mobile's equivalent pause comes free from background JS suspension.
      if (!isDocumentVisible()) {
        scheduleNextPoll(convId)
        return
      }
      if (isFetching.current) {
        scheduleNextPoll(convId)
        return
      }
      isFetching.current = true
      try {
        const existing = useChatStore.getState().messages[convId] ?? []
        const countBefore = existing.length
        await fetchMessages(convId)
        const countAfter = (useChatStore.getState().messages[convId] ?? []).length
        if (countAfter === countBefore) {
          emptyPollCount.current += 1
        } else {
          emptyPollCount.current = 0
        }
      } catch {
        // Poll errors are silent, the next cycle retries.
      } finally {
        isFetching.current = false
        scheduleNextPoll(convId)
      }
    }, delay)
  }, [fetchMessages])

  useEffect(() => {
    if (!conversationId) return
    emptyPollCount.current = 0
    isFetching.current = false
    scheduleNextPoll(conversationId)
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [conversationId, scheduleNextPoll])
}
