/**
 * #29's acceptance test: an admin mutation on pod A is visible on pod B before
 * B's TTL runs out — against the REAL cached readers (`getPlatformConfig`,
 * `getFeaturedGigs`), not a stub of them.
 *
 * Pod B is this process, with its caches registered on the process-wide bus.
 * Pod A is a second bus with its own Redis transport on the same (in-memory)
 * pub/sub hub, and calls `invalidate` the way the admin route does on a PATCH.
 */
import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyBaseLogger } from 'fastify'

process.env.DATABASE_URL ??= 'postgres://localhost/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.API_BASE_URL ??= 'http://127.0.0.1:3000'

import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared'
import type { platform_config } from '@tenda/shared/db/schema'
import { getPlatformConfig, invalidatePlatformConfigCache } from '@server/lib/platform'
import { getFeaturedGigs, invalidateFeaturedCache } from '@server/features/gigs/featured'
import {
  cacheBus,
  createInvalidationBus,
  createRedisInvalidationTransport,
} from '@server/lib/cache-invalidation'
import type { AppDatabase } from '@server/plugins/db'
import { createFakeRedisHub, settle } from '../helpers/fake-redis-pubsub'

type Row = typeof platform_config.$inferSelect
const silent = { warn() {} } as unknown as FastifyBaseLogger

/** A db whose single platform_config row can be changed, counting reads. */
function mutableConfigDb(initial: Row) {
  let row = initial
  let reads = 0
  const chain = {
    from: () => chain,
    limit: async () => {
      reads += 1
      const snapshot = row // the row AS OF the query, like a real read
      await Promise.resolve()
      return [snapshot]
    },
  }
  return {
    db: { select: () => chain } as unknown as AppDatabase,
    set: (next: Row) => void (row = next),
    reads: () => reads,
  }
}

/** A db for the featured query: every builder call chains, `limit` yields rows. */
function featuredDb(gate: Promise<void> = Promise.resolve()) {
  let reads = 0
  const chain: Record<string, unknown> = {}
  for (const name of ['from', 'innerJoin', 'where', 'orderBy']) chain[name] = () => chain
  chain.limit = async () => {
    reads += 1
    await gate
    return []
  }
  return { db: { select: () => chain } as unknown as AppDatabase, reads: () => reads }
}

const hub = createFakeRedisHub()
const podBTransport = createRedisInvalidationTransport('redis://x', silent, (raw) => cacheBus.receive(raw), hub.makeClient)
const podA = createInvalidationBus('pod-a')
const podATransport = createRedisInvalidationTransport('redis://x', silent, (raw) => podA.receive(raw), hub.makeClient)
podA.attach(podATransport)
cacheBus.attach(podBTransport)

beforeEach(async () => {
  await Promise.all([podATransport.ready(), podBTransport.ready()])
  invalidatePlatformConfigCache()
  invalidateFeaturedCache()
  await settle()
})

after(async () => {
  cacheBus.attach(null)
  await Promise.all([podATransport.close(), podBTransport.close()])
})

test('PATCH on pod A: pod B serves the NEW platform config on its next read, inside the TTL', async () => {
  const before: Row = { id: 1, ...PLATFORM_CONFIG_DEFAULTS, unassign_window_seconds: 111 }
  const after_: Row = { ...before, unassign_window_seconds: 222 }
  const { db, set, reads } = mutableConfigDb(before)

  assert.equal((await getPlatformConfig(db)).unassign_window_seconds, 111)
  assert.equal((await getPlatformConfig(db)).unassign_window_seconds, 111)
  assert.equal(reads(), 1, 'second read is a cache hit — the TTL is in force')

  set(after_) // the admin PATCH commits on pod A…
  podA.invalidate('platform_config') // …and the route invalidates
  await settle()

  assert.equal((await getPlatformConfig(db)).unassign_window_seconds, 222)
  assert.equal(reads(), 2)
})

test('control: without the broadcast pod B keeps serving the stale value (the bug #29 describes)', async () => {
  const before: Row = { id: 1, ...PLATFORM_CONFIG_DEFAULTS, unassign_window_seconds: 111 }
  const { db, set } = mutableConfigDb(before)
  await getPlatformConfig(db)
  set({ ...before, unassign_window_seconds: 222 })
  await settle()
  assert.equal((await getPlatformConfig(db)).unassign_window_seconds, 111)
})

test('PATCH on pod A: pod B re-reads the featured rail', async () => {
  const { db, reads } = featuredDb()
  await getFeaturedGigs(db)
  await getFeaturedGigs(db)
  assert.equal(reads(), 1)

  podA.invalidate('featured')
  await settle()

  await getFeaturedGigs(db)
  assert.equal(reads(), 2)
})

test('an invalidation for one cache does not flush the other', async () => {
  const cfg = mutableConfigDb({ id: 1, ...PLATFORM_CONFIG_DEFAULTS })
  const featured = featuredDb()
  await getPlatformConfig(cfg.db)
  await getFeaturedGigs(featured.db)

  podA.invalidate('featured')
  await settle()

  await getPlatformConfig(cfg.db)
  await getFeaturedGigs(featured.db)
  assert.equal(cfg.reads(), 1, 'platform config stayed cached')
  assert.equal(featured.reads(), 2)
})

test('a read already in flight when the invalidation lands does not cache its stale row', async () => {
  const before: Row = { id: 1, ...PLATFORM_CONFIG_DEFAULTS, unassign_window_seconds: 111 }
  const mutable = mutableConfigDb(before)

  const inFlight = getPlatformConfig(mutable.db) // snapshots 111, still awaiting
  mutable.set({ ...before, unassign_window_seconds: 222 })
  podA.invalidate('platform_config')
  await settle()
  assert.equal((await inFlight).unassign_window_seconds, 111, 'the caller that asked first gets its answer')

  assert.equal(
    (await getPlatformConfig(mutable.db)).unassign_window_seconds,
    222,
    'but that answer was not stored over the invalidation',
  )
})

test('a featured read in flight across an invalidation does not cache its result', async () => {
  let open: () => void = () => {}
  const gate = new Promise<void>((resolve) => { open = resolve })
  const slow = featuredDb(gate)
  const inFlight = getFeaturedGigs(slow.db)

  podA.invalidate('featured')
  await settle()
  open()
  await inFlight

  await getFeaturedGigs(slow.db)
  assert.equal(slow.reads(), 2, 'the pre-invalidation result was not stored')
})

test('the admin route helpers BROADCAST — pod A hears pod B mutate', async () => {
  const heard: string[] = []
  podA.register('platform_config', () => void heard.push('platform_config'))
  podA.register('featured', () => void heard.push('featured'))

  invalidatePlatformConfigCache()
  invalidateFeaturedCache()
  await settle()

  assert.deepEqual(heard, ['platform_config', 'featured'])
})
