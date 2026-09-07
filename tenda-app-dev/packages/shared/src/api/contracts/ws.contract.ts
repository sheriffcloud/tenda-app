/**
 * WebSocket wire contract — `/v1/ws` (stage-2-listeners.md).
 *
 * Handshake: the client sends the JWT via subprotocol
 * `['tenda.v1.auth', <JWT>]`; servers behind proxies that strip
 * subprotocols accept a `{ auth: <JWT> }` first frame within 5s instead.
 *
 * Client → server frames: `{ sub: '<channel>' }` / `{ unsub: '<channel>' }`.
 * Server → client frames always carry `channel` plus a `type` discriminant.
 */

import type { Message } from '../../types/chat'
import type { GigSummary } from '../../types/gig'
import type { NotificationWire } from '../../types/notification'

export const WS_PATH = '/v1/ws'
export const WS_AUTH_SUBPROTOCOL = 'tenda.v1.auth'

export const GIG_FEED_CHANNEL = 'feed:gigs' as const

export type WsChannelKind = 'escrow' | 'chat' | 'user' | 'feed'

export function wsChannelName(kind: WsChannelKind, id: string): string {
  return `${kind}:${id}`
}

/** New chat message — broadcast on `chat:<conversation_id>`. */
export interface ChatMessageFrame {
  channel: string
  type: 'message'
  message: Message
}

/**
 * Escrow state change — broadcast on `escrow:<escrow_id>` after the
 * verify-tx pipeline applies an event.
 *
 * `event` is the CONTRACT event name, PascalCase exactly as the chain emits
 * it — 'EscrowAccepted', 'CounterpartyAssigned', … (the examples here used to
 * read 'accepted'/'approved', which no producer has ever sent; the shape is
 * pinned by the worker-processors integration test). It stays `string` rather
 * than a union because that vocabulary lives server-side in chains/types, and
 * clients deliberately do not branch on it: `useEscrowLiveRefresh` refetches on
 * ANY frame, so a new event needs no client change.
 *
 * `tx_ref` is the on-chain signature/hash the client correlates against its
 * pending transaction.
 */
export interface EscrowEventFrame {
  channel: string
  type: 'escrow_event'
  escrow_id: string
  event: string
  tx_ref: string
}

/**
 * New in-app notification — broadcast on `user:<id>` after the notification
 * is persisted, so the bell badge / feed update live without polling.
 */
export interface NotificationFrame {
  channel: string
  type: 'notification'
  notification: NotificationWire
}

export type GigUnavailableCause =
  | 'accepted'
  | 'assigned'
  | 'cancelled'
  | 'expired'
  | 'hidden'
  | 'not_public'

interface GigFeedFrameBase {
  channel: typeof GIG_FEED_CHANNEL
  event_id: string
  escrow_id: string
  /** Decimal bigint string; never convert to a JavaScript number. */
  gig_revision: string
  occurred_at: string
}

/** A committed public projection that clients may insert or replace directly. */
export interface GigAvailableFrame extends GigFeedFrameBase {
  type: 'gig_available'
  gig: GigSummary
}

/** A committed transition that removed a listing from the public feed. */
export interface GigUnavailableFrame extends GigFeedFrameBase {
  type: 'gig_unavailable'
  cause: GigUnavailableCause
}

export type GigFeedServerFrame = GigAvailableFrame | GigUnavailableFrame

export type WsServerFrame =
  | ChatMessageFrame
  | EscrowEventFrame
  | NotificationFrame
  | GigFeedServerFrame
