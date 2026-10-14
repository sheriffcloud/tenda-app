/**
 * plugins/cache-invalidation with a REAL Redis (#29): the connected path the
 * in-memory suites cannot reach — the plugin subscribes, a message from another
 * "pod" clears this process's real cached reader, and closing the app detaches.
 *
 * Skipped when no Redis answers (TEST_REDIS_URL, else REDIS_URL, else
 * localhost:6379), the way the DB suites skip without TEST_DATABASE_URL. The
 * topic is fixed, so a dev server on the same Redis would also drop its config
 * caches when this runs — harmless, they re-read.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Redis from 'ioredis'

const REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379'
// The plugin reads its URL through getConfig(), which loads env lazily on first use.
process.env.REDIS_URL = REDIS_URL
process.env.DATABASE_URL ??= 'postgres://localhost/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.API_BASE_URL ??= 'http://127.0.0.1:3000'

import Fastify from 'fastify'
import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared'
import type { platform_config } from '@tenda/shared/db/schema'
import cacheInvalidation from '@server/plugins/cache-invalidation'
import { getPlatformConfig } from '@server/lib/platform'
import {
  cacheBus,
  createInvalidationBus,
  createRedisInvalidationTransport,
} from '@server/lib/cache-invalidation'
import type { AppDatabase } from '@server/plugins/db'
import type { FastifyBaseLogger } from 'fastify'

type Row = typeof platform_config.$inferSelect
const silent = { warn() {} } as unknown as FastifyBaseLogger

async function redisReachable(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null })
  probe.on('error', () => {})
  try {
    await probe.connect()
    return (await probe.ping()) === 'PONG'
  } catch {
    return false
  } finally {
    probe.disconnect()
  }
}

function mutableConfigDb(initial: Row) {
  let row = initial
  let reads = 0
  const chain = {
    from: () => chain,
    limit: async () => {
      reads += 1
      return [row]
    },
  }
  return {
    db: { select: () => chain } as unknown as AppDatabase,
    set: (next: Row) => void (row = next),
    reads: () => reads,
  }
}

/** Reads until one reaches the DB (the cache was cleared), or times out. */
async function untilRefetched(m: ReturnType<typeof mutableConfigDb>, ms = 3000): Promise<void> {
  const end = Date.now() + ms
  for (;;) {
    const before = m.reads()
    await getPlatformConfig(m.db)
    if (m.reads() > before) return
    if (Date.now() > end) throw new Error('the cache was never cleared by the Redis message')
    await new Promise((r) => setTimeout(r, 20))
  }
}

test('a message from another pod through real Redis clears this process, and close() detaches', async (t) => {
  if (!(await redisReachable())) return t.skip(`no Redis at ${REDIS_URL}`)

  const app = Fastify()
  const other = createInvalidationBus('pod-other')
  const otherTransport = createRedisInvalidationTransport(REDIS_URL, silent, (raw) => other.receive(raw))
  let appClosed = false
  try {
    await app.register(cacheInvalidation)
    await app.ready()
    assert.notEqual(cacheBus.current(), null, 'the plugin attached its transport')

    other.attach(otherTransport)
    await otherTransport.ready()

    const before: Row = { id: 1, ...PLATFORM_CONFIG_DEFAULTS, unassign_window_seconds: 111 }
    const mutable = mutableConfigDb(before)
    assert.equal((await getPlatformConfig(mutable.db)).unassign_window_seconds, 111)
    await getPlatformConfig(mutable.db)
    assert.equal(mutable.reads(), 1, 'cached')

    mutable.set({ ...before, unassign_window_seconds: 222 })
    other.invalidate('platform_config')
    // Delivery is asynchronous: poll until a read goes back to the DB.
    await untilRefetched(mutable)
    assert.equal((await getPlatformConfig(mutable.db)).unassign_window_seconds, 222)

    // After close the app no longer listens: a second message must not clear.
    await app.close()
    appClosed = true
    assert.equal(cacheBus.current(), null)
    mutable.set({ ...before, unassign_window_seconds: 333 })
    other.invalidate('platform_config')
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(
      (await getPlatformConfig(mutable.db)).unassign_window_seconds,
      222,
      'a closed app must not receive invalidations',
    )
  } finally {
    // A failed assertion must not leave sockets open: node --test would hang.
    if (!appClosed) await app.close()
    await otherTransport.close()
    cacheBus.attach(null)
  }
})
