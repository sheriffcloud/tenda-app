/**
 * lib/cache-invalidation/bus — the contract between a mutation on one instance
 * and the caches on every other (#29): what is sent, what is ignored on
 * receipt, and that no transport means purely local behaviour.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInvalidationBus, type InvalidationTransport } from '@server/lib/cache-invalidation'

function recorder(): InvalidationTransport & { sent: string[] } {
  const sent: string[] = []
  return { sent, publish: (m) => void sent.push(m), close: async () => {} }
}

test('invalidate clears the local cache and publishes one versioned message', () => {
  const bus = createInvalidationBus('pod-a')
  const transport = recorder()
  let cleared = 0
  bus.register('platform_config', () => void (cleared += 1))
  bus.attach(transport)

  bus.invalidate('platform_config')

  assert.equal(cleared, 1)
  assert.deepEqual(transport.sent.map((m) => JSON.parse(m)), [{ v: 1, source: 'pod-a', name: 'platform_config' }])
})

test('without a transport invalidation is local only, and does not throw', () => {
  const bus = createInvalidationBus('pod-a')
  let cleared = 0
  bus.register('featured', () => void (cleared += 1))
  bus.invalidate('featured')
  assert.equal(cleared, 1)
})

test('invalidate clears only the named cache', () => {
  const bus = createInvalidationBus('pod-a')
  const cleared: string[] = []
  bus.register('platform_config', () => void cleared.push('platform_config'))
  bus.register('featured', () => void cleared.push('featured'))
  bus.invalidate('featured')
  assert.deepEqual(cleared, ['featured'])
})

test('a remote message clears the named cache and does NOT echo back out', () => {
  const bus = createInvalidationBus('pod-b')
  const transport = recorder()
  let cleared = 0
  bus.register('platform_config', () => void (cleared += 1))
  bus.attach(transport)

  bus.receive(JSON.stringify({ v: 1, source: 'pod-a', name: 'platform_config' }))

  assert.equal(cleared, 1)
  assert.deepEqual(transport.sent, [], 'receiving must not rebroadcast (that would loop)')
})

test('its own broadcast coming back is ignored', () => {
  const bus = createInvalidationBus('pod-a')
  let cleared = 0
  bus.register('platform_config', () => void (cleared += 1))
  bus.receive(JSON.stringify({ v: 1, source: 'pod-a', name: 'platform_config' }))
  assert.equal(cleared, 0)
})

test('malformed, unversioned and unknown messages are dropped without throwing', () => {
  const bus = createInvalidationBus('pod-b')
  let cleared = 0
  bus.register('platform_config', () => void (cleared += 1))
  for (const raw of [
    'not json',
    'null',
    '"platform_config"',
    JSON.stringify({ v: 2, source: 'pod-a', name: 'platform_config' }),
    JSON.stringify({ source: 'pod-a', name: 'platform_config' }),
    JSON.stringify({ v: 1, source: 'pod-a', name: 'toString' }),
    JSON.stringify({ v: 1, source: 'pod-a', name: 'nope' }),
  ]) {
    bus.receive(raw)
  }
  assert.equal(cleared, 0)
})

test('a cache that never registered is a no-op, not a crash', () => {
  const bus = createInvalidationBus('pod-b')
  bus.receive(JSON.stringify({ v: 1, source: 'pod-a', name: 'featured' }))
  bus.invalidate('featured')
})

test('attach(null) stops broadcasting; current() reports the attached transport', () => {
  const bus = createInvalidationBus('pod-a')
  const transport = recorder()
  bus.attach(transport)
  assert.equal(bus.current(), transport)
  bus.attach(null)
  assert.equal(bus.current(), null)
  bus.invalidate('platform_config')
  assert.deepEqual(transport.sent, [])
})
