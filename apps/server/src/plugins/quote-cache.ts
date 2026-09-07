/**
 * Fiat quote cache plugin: decorates `fastify.quoteCache` with a single,
 * boot-time ioredis-backed cache (buildFiatDeps runs per-request, so the
 * client MUST be a shared singleton, not per-request).
 *
 * Hard-require Redis (approved decision): fiat quoting needs Redis. When
 * REDIS_URL is unset the whole server still boots — but the quote/initiate
 * path fails LOUD with a 503 instead of silently persisting throwaway quotes
 * to Postgres. This mirrors the queue plugin's stub-on-missing-Redis pattern.
 * Tests never touch this plugin: they inject `inMemoryQuoteCache()` directly.
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import Redis from 'ioredis'
import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'
import { getConfig } from '@server/config'
import { redisQuoteCache, type QuoteCache } from '@server/features/fiat-rails/quote-cache'

function unavailable(): AppError {
  return new AppError(
    503,
    ErrorCode.SERVICE_UNAVAILABLE,
    'fiat quote cache unavailable: REDIS_URL not configured',
  )
}

/**
 * The fail-loud stub used when REDIS_URL is unset. Hard-require decision: fiat
 * quoting needs Redis, so every op 503s rather than silently persisting
 * throwaway quotes to Postgres. Exported so the guarantee is directly testable.
 */
export function unavailableQuoteCache(): QuoteCache {
  return {
    async put() {
      throw unavailable()
    },
    async peek() {
      throw unavailable()
    },
    async take() {
      throw unavailable()
    },
  }
}

const quoteCachePlugin: FastifyPluginAsync = async (fastify) => {
  const { REDIS_URL } = getConfig()

  if (REDIS_URL === null) {
    fastify.decorate('quoteCache', unavailableQuoteCache())
    fastify.log.info('quote-cache: REDIS_URL unset, fiat quoting will 503')
    return
  }

  // ioredis accepts the connection URL directly; GET/SET/GETDEL are all
  // non-blocking so the default retry policy is fine for this KV client.
  const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 })
  client.on('error', (err) => fastify.log.warn({ err }, 'quote-cache: redis error'))
  fastify.decorate('quoteCache', redisQuoteCache(client))
  fastify.addHook('onClose', async () => {
    await client.quit()
  })
}

export default fp(quoteCachePlugin, { name: 'quote-cache' })
