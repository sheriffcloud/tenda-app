/**
 * Web port of apps/mobile/hooks/useInboxRealtime.ts, verbatim: keeps the
 * conversations list / unread badge current (E4) — the server mirrors each
 * chat message onto the recipient's `user:<id>` channel; the legacy 15s
 * poll runs only while the socket is down. Mounted once in AppWorkspace (the
 * authed analogue of mobile's (tabs)/_layout).
 */
import { useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { useRealtimeStore, subscribeUserChannel } from '@/stores/realtime.store'
import { useConversationPolling } from './useConversationPolling'

export function useInboxRealtime() {
  const connected = useRealtimeStore((s) => s.connected)
  const myId = useAuthStore((s) => s.user?.id ?? null)

  useEffect(() => {
    if (!myId) return
    return subscribeUserChannel(myId)
  }, [myId])

  // Initial badge load, with WS healthy the fallback poll never runs, so
  // fetch once on mount instead of waiting for the first incoming message.
  useEffect(() => {
    useChatStore.getState().fetchConversations().catch(() => {})
  }, [])

  // Refresh the badge once after a reconnect.
  const wasConnected = useRef(connected)
  useEffect(() => {
    if (connected && !wasConnected.current) {
      useChatStore.getState().fetchConversations().catch(() => {})
    }
    wasConnected.current = connected
  }, [connected])

  useConversationPolling(!connected)
}
