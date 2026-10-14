/**
 * Realtime store — web port of apps/mobile/stores/realtime.store.ts,
 * bridging the singleton WS client into Zustand + the feature stores.
 *
 * `connected` is the chat hooks' suppression signal (fallback polls run
 * ONLY while the socket is down) and, from S5.4, escrow-live's
 * reconnect-reconciliation trigger. The escrow-sync RPC/projection polls
 * deliberately do NOT consult it, exactly like mobile's: a confirmation
 * wait must converge even if frames never come.
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

function isNotificationFrame(f: WsFrame): f is NotificationFrame {
  return f.type === 'notification' && isNotificationWire(f.notification)
}

// ---------- channel subscriptions --------------------------------------------

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
 * Module-level rather than store state because nothing RENDERS it — the same
 * shape as the command palette's store, and for the same reason. It exists so
 * the inbox mirror below can tell "a message arrived somewhere else" from "a
 * message arrived in the thread you are reading".
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
 * ordering, which React is free to choose when the route swaps one thread
 * component for another: the new thread registers, the old one's cleanup then
 * nulls it, and the mirror starts refetching for a conversation that is still
 * on screen — the very flicker this exists to stop. Clearing conditionally
 * makes the order irrelevant.
 */
export function clearOpenConversation(conversationId: string): void {
  if (openConversationId === conversationId) openConversationId = null
}

/**
 * Test seam — module state outlives a test, so one suite's open thread would
 * silently mute the next one's mirror. Same shape as the palette store's.
 * Production never clears unconditionally; see clearOpenConversation.
 */
export function resetOpenConversationForTests(): void {
  openConversationId = null
}

/**
 * "Something happened to YOU" — the only per-user change signal on the wire.
 *
 * Personal lists (My Gigs, My Disputes) have no frame of their own: `feed:gigs`
 * carries the public feed, `escrow:<id>` needs a subscription per row, and
 * neither says "an application landed on your gig". What every such change DOES
 * produce is a notification on `user:<id>`, so that is what these lists listen
 * to — the same reasoning `useEscrowLiveRefresh` already uses in refetching on
 * ANY escrow frame rather than branching on the event name. A new server-side
 * event needs no client change, and a list that refetches once too often is
 * cheaper to live with than one that is silently wrong.
 *
 * A fan-out rather than a second `ws.subscribe`: one socket subscription per
 * channel, many consumers, which is the shape this file already had for chat
 * mirrors and the bell.
 */
type PersonalEventListener = () => void
const personalEventListeners = new Set<PersonalEventListener>()

export function onPersonalEvent(listener: PersonalEventListener): () => void {
  personalEventListeners.add(listener)
  return () => {
    personalEventListeners.delete(listener)
  }
}

/**
 * Inbox-level updates, the server mirrors each chat message onto the
 * recipient's `user:<id>` channel so the conversations list / unread badge
 * stays current without polling.
 */
export function subscribeUserChannel(userId: string): () => void {
  return ws.subscribe(wsChannelName('user', userId), (frame) => {
    // One subscription, three consumers: chat-message mirrors refresh the inbox
    // badge; notification frames feed the notification centre + its bell badge,
    // and then fan out to the personal lists (see `onPersonalEvent`).
    if (isChatMessageFrame(frame)) {
      // ...but NOT for the thread the reader has open. The mirror exists to
      // update the inbox for conversations you are not in; for the open one it
      // is both a wasted request and visibly wrong. The server has not marked
      // the message read yet — that rides the debounced GET /messages a second
      // later — so the refetched list comes back with unread_count=1: the rail
      // badge ticks up and the row jumps from "Earlier" into "Unread", then
      // both undo themselves once the read-sync lands. Once per message, while
      // the reader is looking straight at it (#47).
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
      // Iterated from a COPY: a listener that unsubscribes itself while the
      // set is being walked would otherwise skip whichever came after it.
      //
      // Each one CONTAINED, like the inbox refetch above: this fan-out exists
      // to carry consumers this file does not know about, so one of them
      // throwing must not swallow the rest — nor escape into the socket's frame
      // handler and take the remainder of the frame with it.
      for (const listener of [...personalEventListeners]) {
        try {
          listener()
        } catch {
          // A consumer's own problem. The next notification, the reconnect
          // resync or the disconnected fallback all reach it again.
        }
      }
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
