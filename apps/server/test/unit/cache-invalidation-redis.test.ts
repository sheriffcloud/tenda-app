/**
 * The Redis transport, against an in-memory pub/sub hub (no Redis in unit
 * runs): messages cross between "instances", the topic filter holds, and a
 * failed subscribe or publish degrades instead of throwing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyBaseLogger } from 'fastify'
import {
  CACHE_INVALIDATION_TOPIC,
  createInvalidationBus,
  createRedisInvalidationTransport,
  type RedisPubSubClient,
} from '@server/lib/cache-invalidation'
import { createFakeRedisHub, settle } from '../helpers/fake-redis-pubsub'

function logger(): FastifyBaseLogger & { warnings: unknown[][] } {
  const warnings: unknown[][] = []
  const log = { warnings, warn: (...args: unknown[]) => void warnings.push(args) }
  return log as unknown as FastifyBaseLogger & { warnings: unknown[][] }
}

function pod(hub: ReturnType<typeof createFakeRedisHub>, id: string) {
  const bus = createInvalidationBus(id)
  const log = logger()
  const transport = createRedisInvalidationTransport('redis://x', log, (raw) => bus.receive(raw), hub.makeClient)
  bus.attach(transport)
  let cleared = 0
  bus.register('platform_config', () => void (cleared += 1))
  return { bus, transport, log, cleared: () => cleared }
}

test('an invalidation on pod A clears pod B, and A only once', async () => {
  const hub = createFakeRedisHub()
  const a = pod(hub, 'pod-a')
  const b = pod(hub, 'pod-b')
  await Promise.all([a.transport.ready(), b.transport.ready()])

  a.bus.invalidate('platform_config')
  await settle()

  assert.equal(a.cleared(), 1, 'A clears itself once; its own echo is ignored')
  assert.equal(b.cleared(), 1)
  assert.equal(hub.published.length, 1)
  assert.equal(hub.published[0].topic, CACHE_INVALIDATION_TOPIC)
})

test('a message on some other topic is ignored', async () => {
  const hub = createFakeRedisHub()
  const b = pod(hub, 'pod-b')
  await b.transport.ready()
  // A real broker only delivers subscribed topics; the filter is defence in
  // depth, so inject past the subscription to prove it.
  hub.inject('tenda.realtime.v1', JSON.stringify({ v: 1, source: 'x', name: 'platform_config' }))
  await settle()
  assert.equal(b.cleared(), 0)
})

test('a failed subscribe rejects ready() (the plugin degrades to TTL) without an unhandled rejection', async () => {
  const hub = createFakeRedisHub()
  hub.failNextSubscribe()
  const b = pod(hub, 'pod-b')
  await assert.rejects(b.transport.ready(), /subscribe refused/)
})

test('a failed publish is logged, never thrown, and the local clear still happened', async () => {
  const hub = createFakeRedisHub()
  const client = hub.makeClient('redis://x')
  const broken: RedisPubSubClient = { ...client, publish: async () => { throw new Error('socket closed') } }
  const log = logger()
  const bus = createInvalidationBus('pod-a')
  const transport = createRedisInvalidationTransport('redis://x', log, (raw) => bus.receive(raw), () => broken)
  bus.attach(transport)
  let cleared = 0
  bus.register('platform_config', () => void (cleared += 1))

  bus.invalidate('platform_config')
  await settle()

  assert.equal(cleared, 1)
  assert.equal(log.warnings.length >= 1, true)
})

test('close() quits both connections, so a closed pod stops receiving', async () => {
  const hub = createFakeRedisHub()
  const a = pod(hub, 'pod-a')
  const b = pod(hub, 'pod-b')
  await Promise.all([a.transport.ready(), b.transport.ready()])
  await b.transport.close()

  a.bus.invalidate('platform_config')
  await settle()
  assert.equal(b.cleared(), 0)
})
