/**
 * Web port of apps/mobile/hooks/useChatRealtime.ts, verbatim: realtime
 * delivery for an open chat thread (E4) — messages arrive over the
 * `chat:<id>` WS channel; the legacy short-poll runs ONLY while the socket
 * is down. A reconnect triggers one catch-up fetch to fill the gap.
 *
 * Incoming messages are appended instantly by the channel subscription; a
 * debounced fetchMessages follows so the server marks the conversation
 * read (read-marking rides GET /messages).
 */
import { useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import {
  useRealtimeStore,
  subscribeChatChannel,
  setOpenConversation,
  clearOpenConversation,
} from '@/stores/realtime.store'
import { useMessagePolling } from './useMessagePolling'

const READ_SYNC_DEBOUNCE_MS = 1_000

export function useChatRealtime(conversationId: string | null) {
  const connected = useRealtimeStore((s) => s.connected)
  const readSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!conversationId) return
    // Tells the `user:<id>` inbox mirror to leave this conversation alone while
    // it is on screen — see subscribeUserChannel (#47).
    setOpenConversation(conversationId)
    const myId = useAuthStore.getState().user?.id
    const unsubscribe = subscribeChatChannel(conversationId, (message) => {
      if (message.sender_id === myId) return
      if (readSyncTimer.current) clearTimeout(readSyncTimer.current)
      readSyncTimer.current = setTimeout(() => {
        useChatStore.getState().fetchMessages(conversationId).catch(() => {
          // Read-sync is best-effort, the message is already displayed.
        })
      }, READ_SYNC_DEBOUNCE_MS)
    })
    return () => {
      clearOpenConversation(conversationId)
      unsubscribe()
      if (readSyncTimer.current) clearTimeout(readSyncTimer.current)
    }
  }, [conversationId])

  // Catch-up after a reconnect, anything sent while the socket was down.
  const wasConnected = useRef(connected)
  useEffect(() => {
    if (conversationId && connected && !wasConnected.current) {
      useChatStore.getState().fetchMessages(conversationId).catch(() => {
        // Catch-up is best-effort, the fallback poll covers a failure.
      })
    }
    wasConnected.current = connected
  }, [connected, conversationId])

  // Fallback short-poll, active only while the socket is down.
  useMessagePolling(connected ? null : conversationId)
}
