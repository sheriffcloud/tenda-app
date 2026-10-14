import Redis from 'ioredis'
import type { FastifyBaseLogger } from 'fastify'
import type { InvalidationTransport } from './bus'

export const CACHE_INVALIDATION_TOPIC = 'tenda.cache-invalidate.v1'

/** The slice of ioredis the transport uses, so a test can supply a double. */
export interface RedisPubSubClient {
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'message', listener: (topic: string, message: string) => void): unknown
  subscribe(topic: string): Promise<unknown>
  publish(topic: string, message: string): Promise<unknown>
  quit(): Promise<unknown>
}

export interface RedisInvalidationTransport extends InvalidationTransport {
  /** Resolves once subscribed; REJECTS if it could not (the caller degrades to TTL). */
  ready(): Promise<void>
}

export function createRedisInvalidationTransport(
  redisUrl: string,
  log: FastifyBaseLogger,
  onMessage: (raw: string) => void,
  makeClient: (url: string) => RedisPubSubClient = (url) => new Redis(url, { maxRetriesPerRequest: 3 }),
): RedisInvalidationTransport {
  const publisher = makeClient(redisUrl)
  const subscriber = makeClient(redisUrl)
  publisher.on('error', (err) => log.warn({ err }, 'cache-invalidation publisher Redis error'))
  subscriber.on('error', (err) => log.warn({ err }, 'cache-invalidation subscriber Redis error'))
  subscriber.on('message', (topic, raw) => {
    if (topic === CACHE_INVALIDATION_TOPIC) onMessage(raw)
  })
  const subscription = subscriber.subscribe(CACHE_INVALIDATION_TOPIC).then(() => undefined)
  // Observed here so a failed subscribe is not an unhandled rejection when
  // nobody awaits `ready()`; the caller still sees the rejection if it does.
  subscription.catch(() => undefined)
  return {
    ready: () => subscription,
    publish(message) {
      void publisher.publish(CACHE_INVALIDATION_TOPIC, message).catch((err: Error) => {
        log.warn({ err }, 'cache-invalidation publish failed; other instances fall back to TTL')
      })
    },
    async close() {
      await Promise.allSettled([subscriber.quit(), publisher.quit()])
    },
  }
}
