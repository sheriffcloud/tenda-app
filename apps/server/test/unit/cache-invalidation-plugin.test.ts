/**
 * plugins/cache-invalidation without REDIS_URL: boots, attaches nothing, and
 * leaves invalidation local — the single-instance behaviour the deployment had
 * before #29.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL ??= 'postgres://localhost/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.API_BASE_URL ??= 'http://127.0.0.1:3000'
delete process.env.REDIS_URL

import Fastify from 'fastify'
import cacheInvalidation from '@server/plugins/cache-invalidation'
import { cacheBus } from '@server/lib/cache-invalidation'

test('no REDIS_URL: the plugin loads, attaches no transport, and closes cleanly', async () => {
  const app = Fastify()
  await app.register(cacheInvalidation)
  await app.ready()
  assert.equal(cacheBus.current(), null)
  await app.close()
  assert.equal(cacheBus.current(), null)
})
