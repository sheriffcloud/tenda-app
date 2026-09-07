/**
 * WebSocket plugin (stage-2-listeners.md): registers @fastify/websocket
 * and decorates the in-process broadcaster. The verify-tx worker wiring
 * (#33) publishes escrow events through `fastify.wsBroadcast`; the chat
 * routes publish messages the same way.
 */

import fp from 'fastify-plugin'
import websocket from '@fastify/websocket'
import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import { WS_AUTH_SUBPROTOCOL, createWsBroadcaster } from '@server/lib/ws'
import { getConfig } from '@server/config'
import { createRealtimePublisher, createRedisRealtimeTransport } from '@server/realtime'

const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(websocket, {
    options: {
      // Browsers ABORT the connection when they request subprotocols and
      // the server's handshake response doesn't select one, echo the auth
      // marker back when offered (the JWT rides as a second "protocol" and
      // must not be echoed).
      handleProtocols(protocols: Set<string>) {
        return protocols.has(WS_AUTH_SUBPROTOCOL) ? WS_AUTH_SUBPROTOCOL : false
      },
    },
  })
  const broadcaster = createWsBroadcaster()
  fastify.decorate('wsBroadcast', broadcaster)

  const instanceId = randomUUID()
  let remote: ReturnType<typeof createRedisRealtimeTransport> | null = null
  const controller = createRealtimePublisher(instanceId, broadcaster, () => remote)
  fastify.addHook('onClose', async () => {
    await remote?.close()
  })
  const { REDIS_URL } = getConfig()
  if (REDIS_URL !== null) {
    remote = createRedisRealtimeTransport(REDIS_URL, fastify.log, controller.receiveRemote)
    // A configured pub/sub layer is part of multi-instance correctness. Do
    // not advertise a healthy replica whose remote subscription never became
    // active; an unset REDIS_URL still intentionally runs local-only.
    await remote.ready()
  }
  fastify.decorate('realtime', controller.publisher)
}

export default fp(websocketPlugin, { name: 'websocket' })
