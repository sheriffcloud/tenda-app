import Redis from 'ioredis'
import type { FastifyBaseLogger } from 'fastify'
import {
  parseRealtimeEnvelope,
  REALTIME_MAX_MESSAGE_BYTES,
  serializeRealtimeEnvelope,
  type RealtimeEnvelope,
} from './realtime-envelope'

export const REALTIME_REDIS_TOPIC = 'tenda.realtime.v1'
const REALTIME_REDIS_MAX_RETRIES_PER_REQUEST = 3

export interface RealtimeRemoteTransport {
  ready(): Promise<void>
  publish(envelope: RealtimeEnvelope): void
  close(): Promise<void>
}

export function createRedisRealtimeTransport(
  redisUrl: string,
  log: FastifyBaseLogger,
  onEnvelope: (envelope: RealtimeEnvelope) => void,
): RealtimeRemoteTransport {
  const publisher = new Redis(redisUrl, {
    maxRetriesPerRequest: REALTIME_REDIS_MAX_RETRIES_PER_REQUEST,
  })
  const subscriber = new Redis(redisUrl, {
    maxRetriesPerRequest: REALTIME_REDIS_MAX_RETRIES_PER_REQUEST,
  })
  publisher.on('error', (err) => log.warn({ err }, 'realtime publisher Redis error'))
  subscriber.on('error', (err) => log.warn({ err }, 'realtime subscriber Redis error'))
  subscriber.on('message', (topic, raw) => {
    if (topic !== REALTIME_REDIS_TOPIC) return
    if (Buffer.byteLength(raw, 'utf8') > REALTIME_MAX_MESSAGE_BYTES) {
      log.warn('realtime subscriber rejected oversized message')
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      log.warn('realtime subscriber rejected malformed JSON')
      return
    }
    const envelope = parseRealtimeEnvelope(parsed)
    if (envelope === null) {
      log.warn('realtime subscriber rejected invalid envelope')
      return
    }
    onEnvelope(envelope)
  })
  const subscription = subscriber.subscribe(REALTIME_REDIS_TOPIC).then(() => undefined).catch((err: Error) => {
    log.warn({ err }, 'realtime subscriber failed to subscribe')
    throw err
  })
  return {
    ready() { return subscription },
    publish(envelope) {
      const serialized = serializeRealtimeEnvelope(envelope)
      if (serialized === null) {
        log.warn('realtime publisher rejected oversized message; local delivery preserved')
        return
      }
      void publisher.publish(REALTIME_REDIS_TOPIC, serialized).catch((err: Error) => {
        log.warn({ err }, 'realtime publisher failed; local delivery preserved')
      })
    },
    async close() {
      await Promise.allSettled([subscriber.quit(), publisher.quit()])
    },
  }
}
