import { useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chat.store'

const POLL_INTERVAL_MS = 4_000
const POLL_IDLE_MS     = 10_000
const EMPTY_POLL_LIMIT = 3

/**
 * Polls for new messages on the given conversation.
 * Backs off to a slower interval after 3 consecutive empty polls.
 * Stops automatically when conversationId is null or on unmount.
 */
export function useMessagePolling(conversationId: string | null) {
  const { fetchMessages } = useChatStore()

  const pollTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emptyPollCount = useRef(0)
  const isFetching     = useRef(false)

  const scheduleNextPoll = useCallback((convId: string) => {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    const delay = emptyPollCount.current >= EMPTY_POLL_LIMIT ? POLL_IDLE_MS : POLL_INTERVAL_MS

    pollTimer.current = setTimeout(async () => {
      if (isFetching.current) {
        scheduleNextPoll(convId)
        return
      }
      isFetching.current = true
      try {
        const existing    = useChatStore.getState().messages[convId] ?? []
        const countBefore = existing.length
        await fetchMessages(convId)
        const countAfter  = (useChatStore.getState().messages[convId] ?? []).length
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
    isFetching.current     = false
    scheduleNextPoll(conversationId)
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [conversationId, scheduleNextPoll])
}
