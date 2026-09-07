/**
 * GET /v1/ws, WebSocket upgrade (stage-2-listeners.md § WebSocket
 * protocol).
 *
 * Auth order:
 *   1. Subprotocol header (`tenda.v1.auth, <JWT>`), preferred; the JWT
 *      never appears in URLs/access logs.
 *   2. Fallback for clients that can't set subprotocols: accept the
 *      upgrade, wait ≤AUTH_GRACE_MS for a first `{ "auth": "<JWT>" }`
 *      frame, disconnect otherwise.
 *
 * Client frames: `{ "sub": "escrow:<id>" }` / `{ "unsub": ... }`.
 * Authorization per channel runs against the DB before subscribing.
 */

import type { FastifyPluginAsync } from 'fastify'
import type WebSocket from 'ws'
import {
  authorizeChannel,
  channelName,
  createWsSubscriptionIntent,
  drizzleWsAuthStore,
  parseChannel,
  parseSubprotocolAuth,
} from '@server/lib/ws'

export const WS_AUTH_GRACE_MS = 5_000

interface JwtUser {
  id: string
}

const route: FastifyPluginAsync = async (fastify) => {
  const authStore = drizzleWsAuthStore(fastify.db)

  function verifyToken(token: string): string | null {
    try {
      const payload = fastify.jwt.verify<JwtUser>(token)
      return typeof payload.id === 'string' && payload.id !== '' ? payload.id : null
    } catch {
      return null
    }
  }

  fastify.get('/', { websocket: true }, (socket: WebSocket, request) => {
    const headerToken = parseSubprotocolAuth(request.headers['sec-websocket-protocol'])
    const headerUserId = headerToken !== null ? verifyToken(headerToken) : null
    let user_id: string | null = null
    const intent = createWsSubscriptionIntent()
    const headerAuthentication = headerUserId === null
      ? null
      : authStore.isActiveUser(headerUserId).then((active) => active ? headerUserId : null)

    if (headerToken !== null && headerUserId === null) {
      // A token was presented and it's bad, reject immediately.
      socket.close(4001, 'unauthorized')
      return
    }
    if (headerAuthentication !== null) {
      void headerAuthentication.then((authenticatedUserId) => {
        user_id = authenticatedUserId
        if (authenticatedUserId === null) socket.close(4001, 'unauthorized')
      }).catch((err: Error) => {
        request.log.warn({ err }, 'ws account authentication failed')
        socket.close(1011, 'authentication unavailable')
      })
    }

    // Fallback path: no subprotocol auth, allow a short window for an
    // auth frame before disconnecting.
    const authTimer =
      headerToken === null
        ? setTimeout(() => {
            if (user_id === null) socket.close(4001, 'auth timeout')
          }, WS_AUTH_GRACE_MS)
        : null

    socket.on('message', (raw: Buffer) => {
      let frame: Record<string, unknown>
      try {
        frame = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        socket.send(JSON.stringify({ error: 'invalid frame' }))
        return
      }

      const handleFrame = async (): Promise<void> => {
        if (headerAuthentication !== null && user_id === null) {
          user_id = await headerAuthentication
          if (user_id === null) {
            socket.close(4001, 'unauthorized')
            return
          }
        }

        if (user_id === null) {
          const token = frame.auth
          if (typeof token === 'string') {
            const verifiedUserId = verifyToken(token)
            user_id = verifiedUserId !== null && await authStore.isActiveUser(verifiedUserId)
              ? verifiedUserId
              : null
            if (user_id !== null) {
              if (authTimer !== null) clearTimeout(authTimer)
              socket.send(JSON.stringify({ ok: 'authenticated' }))
              return
            }
          }
          socket.close(4001, 'unauthorized')
          return
        }
        const uid = user_id

        if ('sub' in frame) {
          const channel = parseChannel(frame.sub)
          if (channel === null) {
            socket.send(JSON.stringify({ error: 'unknown channel' }))
            return
          }
          const name = channelName(channel)
          intent.request(name)
          const allowed = await authorizeChannel(authStore, channel, uid)
          if (!allowed) {
            intent.cancel(name)
            socket.send(JSON.stringify({ error: 'forbidden', channel: name }))
            return
          }
          if (!intent.wants(name)) return
          fastify.wsBroadcast.subscribe(name, socket)
          socket.send(JSON.stringify({ ok: 'subscribed', channel: name }))
        } else if ('unsub' in frame) {
          const channel = parseChannel(frame.unsub)
          if (channel !== null) {
            const name = channelName(channel)
            intent.cancel(name)
            fastify.wsBroadcast.unsubscribe(name, socket)
          }
        }
      }
      void handleFrame().catch((err) => {
        request.log.warn({ err }, 'ws frame handling failed')
        socket.send(JSON.stringify({ error: 'internal' }))
      })
    })

    socket.on('close', () => {
      intent.close()
      if (authTimer !== null) clearTimeout(authTimer)
      fastify.wsBroadcast.removeSink(socket)
    })
  })
}

export default route
