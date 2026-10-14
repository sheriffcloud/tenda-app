/**
 * Connects the process-wide cache bus to Redis pub/sub so an admin mutation on
 * one instance clears the platform-config and featured caches on all of them
 * (#29). No REDIS_URL means a single-instance deployment: invalidation stays
 * local, exactly as before. A subscription that cannot be established is a
 * warning, not a boot failure — the caches' TTLs bound the staleness.
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { getConfig } from '@server/config'
import { cacheBus, createRedisInvalidationTransport } from '@server/lib/cache-invalidation'

const cacheInvalidationPlugin: FastifyPluginAsync = async (fastify) => {
  const { REDIS_URL } = getConfig()
  if (REDIS_URL === null) {
    fastify.log.info('cache-invalidation: REDIS_URL unset, invalidation is local to this instance')
    return
  }
  const transport = createRedisInvalidationTransport(REDIS_URL, fastify.log, (raw) => cacheBus.receive(raw))
  cacheBus.attach(transport)
  try {
    await transport.ready()
  } catch (err) {
    fastify.log.warn({ err }, 'cache-invalidation: subscribe failed, other instances rely on cache TTL')
  }
  fastify.addHook('onClose', async () => {
    // Only detach our own: a later app in the same process may have attached.
    if (cacheBus.current() === transport) cacheBus.attach(null)
    await transport.close()
  })
}

export default fp(cacheInvalidationPlugin, { name: 'cache-invalidation' })
