/**
 * Cross-instance invalidation for the server's per-process caches (#29).
 *
 * `getPlatformConfig` (5 min TTL) and `getFeaturedGigs` (60 s) cache in module
 * memory. With one pod that is fine; with several, an admin PATCH on pod A
 * cleared only A's copy and pod B served the old value until its TTL ran out —
 * for platform config that is five minutes of a stale grace period / unassign
 * window. The bus fixes exactly that and nothing more: a mutation clears the
 * local copy AND tells every other instance to clear theirs. The data itself
 * is still read from Postgres, so there is nothing to keep consistent in Redis
 * — only a "forget it" message.
 *
 * Without a transport (no REDIS_URL, tests) `invalidate` is purely local,
 * which is the old behaviour. A lost message degrades to the TTL, never to
 * wrong data.
 */

/** The caches that take part. A closed list so a typo cannot silently no-op. */
export const CACHE_NAMES = ['platform_config', 'featured'] as const
export type CacheName = (typeof CACHE_NAMES)[number]

/** What the bus needs from a remote channel; Redis pub/sub in production. */
export interface InvalidationTransport {
  publish(message: string): void
  close(): Promise<void>
}

export interface InvalidationBus {
  /** Declare how this process clears one of its caches. */
  register(name: CacheName, clearLocal: () => void): void
  /** Clear the local copy now and tell the other instances to clear theirs. */
  invalidate(name: CacheName): void
  /** Handle a raw message from the transport. Never throws. */
  receive(raw: string): void
  /** Start (or, with null, stop) broadcasting. */
  attach(transport: InvalidationTransport | null): void
  /** The transport currently attached, so a closing app only detaches its own. */
  current(): InvalidationTransport | null
}

function isCacheName(value: unknown): value is CacheName {
  return CACHE_NAMES.some((name) => name === value)
}

export function createInvalidationBus(instanceId: string): InvalidationBus {
  const handlers = new Map<CacheName, () => void>()
  let transport: InvalidationTransport | null = null

  return {
    register(name, clearLocal) {
      handlers.set(name, clearLocal)
    },
    invalidate(name) {
      handlers.get(name)?.()
      transport?.publish(JSON.stringify({ v: 1, source: instanceId, name }))
    },
    receive(raw) {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }
      if (typeof parsed !== 'object' || parsed === null) return
      const { v, source, name } = parsed as { v?: unknown; source?: unknown; name?: unknown }
      // Our own broadcast comes back on the subscription; it has already been
      // applied locally, and applying it twice would only cost a re-read.
      if (v !== 1 || source === instanceId || !isCacheName(name)) return
      handlers.get(name)?.()
    },
    attach(next) {
      transport = next
    },
    current() {
      return transport
    },
  }
}
