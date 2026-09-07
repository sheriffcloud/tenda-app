/**
 * plugins/listeners — load-order contract. The polling listener captures
 * `fastify.queue` at registration time, so the queue plugin MUST decorate it
 * first. @fastify/autoload topologically sorts by fastify-plugin `dependencies`;
 * if 'queue' is dropped from that list autoload falls back to directory order
 * (listeners.ts sorts before queue/) and the poller grabs an undefined queue,
 * crashing every tick with "Cannot read properties of undefined (reading
 * 'enqueue')". This test guards that exact regression.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import listenersPlugin from '@server/plugins/listeners'

interface PluginMeta {
  name?: string
  dependencies?: readonly string[]
}

/** Read fastify-plugin's metadata off the wrapped plugin (symbol-keyed). */
function pluginMeta(fn: object): PluginMeta {
  return (fn as Record<symbol, PluginMeta>)[Symbol.for('plugin-meta')] ?? {}
}

test('listeners plugin declares queue as a load-order dependency', () => {
  const deps = pluginMeta(listenersPlugin).dependencies ?? []
  assert.ok(
    deps.includes('queue'),
    `listeners must depend on 'queue' so it loads after the queue plugin (got: ${JSON.stringify(deps)})`,
  )
})

test('listeners plugin also depends on db and chains', () => {
  const deps = pluginMeta(listenersPlugin).dependencies ?? []
  assert.ok(deps.includes('db'), 'listeners needs db for the cursor store')
  assert.ok(deps.includes('chains'), 'listeners needs the chain adapter registry')
})
