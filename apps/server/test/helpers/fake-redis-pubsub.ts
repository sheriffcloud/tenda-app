/**
 * An in-memory stand-in for Redis pub/sub: every client made from one hub sees
 * every message published through any client, like instances sharing a Redis.
 * Delivery is asynchronous (a microtask), as it is over a socket.
 */
import type { RedisPubSubClient } from '@server/lib/cache-invalidation'

export interface FakeRedisHub {
  /** Pass as the transport's `makeClient`. */
  makeClient: (url: string) => RedisPubSubClient
  /** Everything ever published, in order. */
  readonly published: ReadonlyArray<{ topic: string; message: string }>
  /** Make the next `subscribe` reject, to exercise the degrade path. */
  failNextSubscribe(): void
  /** Hand a message to EVERY client's listeners, subscribed or not (defence-in-depth tests). */
  inject(topic: string, message: string): void
}

export function createFakeRedisHub(): FakeRedisHub {
  interface Subscriber {
    topics: Set<string>
    onMessage: Array<(topic: string, message: string) => void>
  }
  const subscribers = new Set<Subscriber>()
  const published: Array<{ topic: string; message: string }> = []
  let failSubscribe = false

  return {
    published,
    inject(topic, message) {
      for (const s of subscribers) for (const listener of s.onMessage) listener(topic, message)
    },
    failNextSubscribe() {
      failSubscribe = true
    },
    makeClient() {
      const me: Subscriber = { topics: new Set(), onMessage: [] }
      subscribers.add(me)
      const client: RedisPubSubClient = {
        on(event: string, listener: (...args: never[]) => void) {
          if (event === 'message') me.onMessage.push(listener as (topic: string, message: string) => void)
          return client
        },
        async subscribe(topic) {
          if (failSubscribe) {
            failSubscribe = false
            throw new Error('subscribe refused')
          }
          me.topics.add(topic)
        },
        async publish(topic, message) {
          published.push({ topic, message })
          await Promise.resolve()
          for (const s of subscribers) {
            if (!s.topics.has(topic)) continue
            for (const listener of s.onMessage) listener(topic, message)
          }
        },
        async quit() {
          subscribers.delete(me)
        },
      }
      return client
    },
  }
}

/** Let the hub's microtask deliveries land. */
export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}
