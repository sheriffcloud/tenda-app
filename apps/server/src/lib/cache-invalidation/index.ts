import { randomUUID } from 'node:crypto'
import { createInvalidationBus } from './bus'

export { CACHE_NAMES, createInvalidationBus } from './bus'
export type { CacheName, InvalidationBus, InvalidationTransport } from './bus'
export {
  CACHE_INVALIDATION_TOPIC,
  createRedisInvalidationTransport,
  type RedisInvalidationTransport,
  type RedisPubSubClient,
} from './redis-transport'

/**
 * The process-wide bus. A singleton because the caches it clears are module
 * state; each cache registers itself at import time.
 */
export const cacheBus = createInvalidationBus(randomUUID())
