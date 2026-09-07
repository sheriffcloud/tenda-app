/**
 * WebSocket protocol helpers + in-process broadcaster
 * (stage-2-listeners.md § WebSocket protocol).
 *
 * Auth travels in the subprotocol header, never the query string (JWTs in
 * URLs leak into proxy/access logs):
 *
 *   Sec-WebSocket-Protocol: tenda.v1.auth, <JWT>
 *
 * Channels: `escrow:<id>` (parties only), `chat:<conversation_id>`
 * (members only), `user:<id>` (self only). The broadcaster is in-process
 * pub/sub, Redis pub/sub lands with horizontal scaling (stage-2 open
 * question, deliberately deferred).
 */

import { and, eq, or } from 'drizzle-orm'
import { WS_AUTH_SUBPROTOCOL, wsChannelName } from '@tenda/shared'
import { conversations, users } from '@tenda/shared/db/schema'
import { escrows } from '@tenda/shared/db/schema/escrow'
import type { AppDatabase } from '@server/plugins/db'
import { isEscrowPartyOrAssigned } from '@server/lib/escrow-party'
import { isUuidLike } from '@server/lib/uuid'

// ---------- subprotocol auth -------------------------------------------------

export { WS_AUTH_SUBPROTOCOL }

/**
 * Parse `Sec-WebSocket-Protocol: tenda.v1.auth, <JWT>`. Returns the token
 * or null. The header is a comma-separated list; the JWT is whichever
 * entry follows the marker protocol.
 */
export function parseSubprotocolAuth(header: string | undefined): string | null {
  if (header === undefined) return null
  const parts = header.split(',').map((p) => p.trim())
  const markerIdx = parts.indexOf(WS_AUTH_SUBPROTOCOL)
  if (markerIdx === -1) return null
  const token = parts[markerIdx + 1]
  return token !== undefined && token.length > 0 ? token : null
}

// ---------- channels -----------------------------------------------------------

export type WsChannel =
  | { kind: 'escrow'; id: string }
  | { kind: 'chat'; id: string }
  | { kind: 'user'; id: string }
  | { kind: 'feed'; id: 'gigs' }

export function parseChannel(name: unknown): WsChannel | null {
  if (typeof name !== 'string') return null
  const sep = name.indexOf(':')
  if (sep <= 0 || sep === name.length - 1) return null
  const kind = name.slice(0, sep)
  const id = name.slice(sep + 1)
  if (kind === 'feed') return id === 'gigs' ? { kind, id } : null
  if (kind === 'escrow' || kind === 'chat' || kind === 'user') return { kind, id }
  return null
}

export function channelName(c: WsChannel): string {
  return wsChannelName(c.kind, c.id)
}

// ---------- authorization --------------------------------------------------------

export interface WsAuthStore {
  /** True iff the JWT subject still names an active account. */
  isActiveUser(user_id: string): Promise<boolean>
  /**
   * True iff the user is creator / counterparty / pending assignee. Named for
   * the WIDER notion on purpose: a direct-offer invitee subscribes to the
   * escrow before accepting it, so this is `isEscrowPartyOrAssigned`, not the
   * settled-parties-only `isEscrowParty` (see lib/escrow-party.ts).
   */
  isEscrowPartyOrAssigned(escrow_id: string, user_id: string): Promise<boolean>
  /** True iff the user is a member of the conversation. */
  isConversationMember(conversation_id: string, user_id: string): Promise<boolean>
}

export function drizzleWsAuthStore(db: AppDatabase): WsAuthStore {
  return {
    async isActiveUser(user_id) {
      if (!isUuidLike(user_id)) return false
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, user_id), eq(users.status, 'active')))
        .limit(1)
      return rows.length > 0
    },
    async isEscrowPartyOrAssigned(escrow_id, user_id) {
      // `parseChannel` accepts any non-empty string after `escrow:`, and both
      // id columns are postgres `uuid` — an unparseable id reaches the driver
      // as `invalid input syntax for type uuid`, i.e. a thrown query and a
      // logged warning per frame where the honest answer is simply "no". Same
      // short-circuit `loadEscrowOr404` applies on the HTTP routes.
      if (!isUuidLike(escrow_id)) return false
      const rows = await db
        .select({ id: escrows.id })
        .from(escrows)
        .where(and(eq(escrows.id, escrow_id), isEscrowPartyOrAssigned(user_id)))
        .limit(1)
      return rows.length > 0
    },
    async isConversationMember(conversation_id, user_id) {
      if (!isUuidLike(conversation_id)) return false
      const rows = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversation_id),
            or(eq(conversations.user_a_id, user_id), eq(conversations.user_b_id, user_id)),
          ),
        )
        .limit(1)
      return rows.length > 0
    },
  }
}

export interface WsSubscriptionIntent {
  request(channel: string): void
  cancel(channel: string): void
  close(): void
  wants(channel: string): boolean
}

/** Tracks client intent while channel authorization is awaiting the database. */
export function createWsSubscriptionIntent(): WsSubscriptionIntent {
  const requested = new Set<string>()
  let closed = false
  return {
    request(channel) { if (!closed) requested.add(channel) },
    cancel(channel) { requested.delete(channel) },
    close() { closed = true; requested.clear() },
    wants(channel) { return !closed && requested.has(channel) },
  }
}

export async function authorizeChannel(
  store: WsAuthStore,
  channel: WsChannel,
  user_id: string,
): Promise<boolean> {
  if (!await store.isActiveUser(user_id)) return false
  switch (channel.kind) {
    case 'feed':
      // The socket handshake is already authenticated. Feed frames contain
      // only the same public projection served by GET /v1/gigs.
      return channel.id === 'gigs'
    case 'user':
      return channel.id === user_id
    case 'escrow':
      return store.isEscrowPartyOrAssigned(channel.id, user_id)
    case 'chat':
      return store.isConversationMember(channel.id, user_id)
  }
}

// ---------- broadcaster ------------------------------------------------------------

/** Minimal sink, the @fastify/websocket socket satisfies it structurally. */
export interface WsSink {
  send(data: string): void
}

export interface WsBroadcaster {
  subscribe(channel: string, sink: WsSink): void
  unsubscribe(channel: string, sink: WsSink): void
  /** Drop a sink from every channel (socket closed). */
  removeSink(sink: WsSink): void
  /** Send to every subscriber; returns the recipient count. */
  broadcast(channel: string, payload: Record<string, unknown>): number
}

export function createWsBroadcaster(): WsBroadcaster {
  const channels = new Map<string, Set<WsSink>>()
  return {
    subscribe(channel, sink) {
      let set = channels.get(channel)
      if (set === undefined) {
        set = new Set()
        channels.set(channel, set)
      }
      set.add(sink)
    },
    unsubscribe(channel, sink) {
      const set = channels.get(channel)
      if (set === undefined) return
      set.delete(sink)
      if (set.size === 0) channels.delete(channel)
    },
    removeSink(sink) {
      for (const [name, set] of channels) {
        set.delete(sink)
        if (set.size === 0) channels.delete(name)
      }
    },
    broadcast(channel, payload) {
      const set = channels.get(channel)
      if (set === undefined) return 0
      const data = JSON.stringify({ channel, ...payload })
      let sent = 0
      for (const sink of set) {
        try {
          sink.send(data)
          sent += 1
        } catch {
          // Dead socket, drop it so the set self-heals.
          set.delete(sink)
        }
      }
      return sent
    },
  }
}
