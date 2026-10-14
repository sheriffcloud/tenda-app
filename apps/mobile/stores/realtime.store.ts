/**
 * Realtime store (stage-2-listeners.md § Mobile), bridges the singleton
 * WS client into Zustand + the feature stores.
 *
 * `connected` is the chat hooks' suppression signal: useInboxRealtime and
 * useChatRealtime run their fallback polls ONLY while the socket is down,
 * and fire one catch-up fetch on reconnect. The escrow-sync confirmation
 * polls deliberately never consult it — a confirmation wait must converge
 * even if frames never arrive. (TransactionMonitor reacts to NetInfo
 * device-offline state, not to this flag.)
 */

import { create } from 'zustand'
import {
  wsChannelName,
  type Message,
  type ChatMessageFrame,
  type EscrowEventFrame,
  type NotificationWire,
  GIG_FEED_CHANNEL,
  type GigFeedServerFrame,
} from '@tenda/shared'
import { ws, type WsFrame } from '@/lib/ws'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'

interface RealtimeState {
  connected: boolean
}

export const useRealtimeStore = create<RealtimeState>(() => ({
  connected: false,
}))

ws.onConnectionChange((connected) => {
  useRealtimeStore.setState({ connected })
})

// ---------- frame guards -----------------------------------------------------

function isMessage(v: unknown): v is Message {
  return (
    typeof v === 'object' && v !== null &&
    'id' in v && typeof v.id === 'string' &&
    'conversation_id' in v && typeof v.conversation_id === 'string' &&
    'sender_id' in v && typeof v.sender_id === 'string' &&
    'content' in v && typeof v.content === 'string'
  )
}

function isChatMessageFrame(f: WsFrame): f is ChatMessageFrame & WsFrame {
  return f.type === 'message' && isMessage(f.message)
}

export function isEscrowEventFrame(f: WsFrame): f is EscrowEventFrame & WsFrame {
  return (
    f.type === 'escrow_event' &&
    typeof f.escrow_id === 'string' &&
    typeof f.event === 'string' &&
    typeof f.tx_ref === 'string'
  )
}

function isNotificationWire(v: unknown): v is NotificationWire {
  return (
    typeof v === 'object' && v !== null &&
    'id' in v && typeof v.id === 'string' &&
    'title' in v && typeof v.title === 'string' &&
    'body' in v && typeof v.body === 'string'
  )
}

type NotificationFrame = WsFrame & { type: 'notification'; notification: NotificationWire }

export function isNotificationFrame(f: object): f is NotificationFrame {
  // `f.notification` is `unknown` via WsFrame's index signature — narrowed, not cast.
  return 'type' in f && f.type === 'notification' && 'notification' in f && isNotificationWire(f.notification)
}

// ---------- channel subscriptions ----------------------------------------------

/**
 * Live messages for an open chat screen. Frames echo back to the sender
 * too, receiveMessage dedupes by id against the optimistic copy.
 */
export function subscribeChatChannel(
  conversationId: string,
  onMessage?: (message: Message) => void,
): () => void {
  return ws.subscribe(wsChannelName('chat', conversationId), (frame) => {
    if (!isChatMessageFrame(frame)) return
    useChatStore.getState().receiveMessage(conversationId, frame.message)
    onMessage?.(frame.message)
  })
}

/**
 * The conversation the reader currently has open, or null.
 *
 * Module-level rather than store state because nothing RENDERS it — it exists
 * so the inbox mirror below can tell "a message arrived somewhere else" from
 * "a message arrived in the thread you are reading". Kept in this file, and
 * with the same names as web's, because the two realtime stores are ports of
 * each other: the closer their shape stays, the cheaper the next parity fix is.
 */
let openConversationId: string | null = null

/** Set by useChatRealtime when a thread mounts. */
export function setOpenConversation(conversationId: string): void {
  openConversationId = conversationId
}

/**
 * Cleared by useChatRealtime when a thread unmounts — but only if it is still
 * the registered one.
 *
 * A blind `setOpenConversation(null)` is wrong under a mount-before-unmount
 * ordering, which React is free to choose when one thread screen replaces
 * another: the new thread registers, the old one's cleanup then nulls it, and
 * the mirror starts refetching for a conversation that is still on screen —
 * the very flicker this exists to stop. Clearing conditionally makes the order
 * irrelevant.
 */
export function clearOpenConversation(conversationId: string): void {
  if (openConversationId === conversationId) openConversationId = null
}

/**
 * Test seam — module state outlives a test, so one suite's open thread would
 * silently mute the next one's mirror. Production never clears
 * unconditionally; see clearOpenConversation.
 */
export function resetOpenConversationForTests(): void {
  openConversationId = null
}

/**
 * Inbox-level updates, the server mirrors each chat message onto the
 * recipient's `user:<id>` channel so the conversations list / unread badge
 * stays current without polling.
 */
export function subscribeUserChannel(userId: string): () => void {
  return ws.subscribe(wsChannelName('user', userId), (frame) => {
    // One subscription, two consumers: chat-message mirrors refresh the inbox
    // badge; notification frames feed the notification centre + its bell badge.
    if (isChatMessageFrame(frame)) {
      // ...but NOT for the thread the reader has open. The mirror exists to
      // update the inbox for conversations you are not in; for the open one it
      // is both a wasted request and visibly wrong. The server has not marked
      // the message read yet — that rides the debounced GET /messages a second
      // later — so the refetched list comes back with unread_count=1: the
      // Messages screen groups by unread (app/(tabs)/messages.tsx), so the row
      // jumps from "Earlier" into "Unread" and the "N unread threads" subtitle
      // ticks up, then both undo themselves. Once per message, while the reader
      // is looking straight at it (#56, web's #47).
      //
      // Nothing is lost by skipping: `subscribeChatChannel` → receiveMessage
      // already advances that conversation's preview and last_message_at, and
      // its unread count is already zero because opening the thread cleared it.
      if (frame.message.conversation_id === openConversationId) return
      useChatStore.getState().fetchConversations().catch(() => {
        // Network hiccup, the next frame or the fallback poll catches up.
      })
      return
    }
    if (isNotificationFrame(frame)) {
      useNotificationsStore.getState().receive(frame.notification)
    }
  })
}

/** Escrow lifecycle events (verify-tx republish → WS, wired in #33). */
export function subscribeEscrowChannel(
  escrowId: string,
  onEvent: (frame: EscrowEventFrame) => void,
): () => void {
  return ws.subscribe(wsChannelName('escrow', escrowId), (frame) => {
    if (isEscrowEventFrame(frame)) onEvent(frame)
  })
}

export function subscribeGigFeedChannel(
  onEvent: (frame: GigFeedServerFrame) => void,
): () => void {
  return ws.subscribe(GIG_FEED_CHANNEL, (frame) => {
    if (frame.type === 'gig_available' || frame.type === 'gig_unavailable') onEvent(frame)
  })
}
