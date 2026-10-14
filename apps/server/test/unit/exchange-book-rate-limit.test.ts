/**
 * The public order book states its OWN rate limit (60 a minute per IP) rather
 * than inheriting the global 100: a list read costs a page of up to 100 rows.
 *
 * Mounts the REAL exchange route plugin behind the REAL rate-limit plugin. The
 * handlers reach for a database this bare app does not have and answer 500 —
 * which is fine: the limiter runs BEFORE the handler, so "not 429" is what the
 * first 60 requests are asserted to be, and the 61st must be the 429.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import Fastify from 'fastify'
import { ErrorCode } from '@tenda/shared'
import rateLimitPlugin from '@server/plugins/rate-limit'
import exchangeRoutes from '@server/routes/v1/exchange'
import { registerErrorHandlers } from '@server/lib/errors/http'
import { PUBLIC_FEED_RATE_LIMIT } from '@server/lib/http/rate-limits'

async function app() {
  const fastify = Fastify()
  registerErrorHandlers(fastify)
  fastify.decorate('authenticate', async () => undefined)
  await fastify.register(rateLimitPlugin)
  await fastify.register(exchangeRoutes, { prefix: '/v1/exchange' })
  await fastify.ready()
  return fastify
}

test('the limit is the named constant: 60 a minute', () => {
  assert.deepStrictEqual({ ...PUBLIC_FEED_RATE_LIMIT }, { max: 60, timeWindow: '1 minute' })
})

test('the book answers 429 RATE_LIMITED on the request after its own ceiling, not the global one', async () => {
  const fastify = await app()
  try {
    for (let i = 0; i < PUBLIC_FEED_RATE_LIMIT.max; i++) {
      const res = await fastify.inject('/v1/exchange')
      assert.notStrictEqual(res.statusCode, 429, `request ${i + 1} must pass the limiter`)
    }
    const over = await fastify.inject('/v1/exchange')
    assert.strictEqual(over.statusCode, 429)
    assert.strictEqual(over.json<{ code: string }>().code, ErrorCode.RATE_LIMITED)
  } finally {
    await fastify.close()
  }
})

test('offer creation keeps the global bucket: the override is on the READ only', async () => {
  const fastify = await app()
  try {
    // 61 reads exhaust the book's bucket; a POST is counted against its own route.
    for (let i = 0; i <= PUBLIC_FEED_RATE_LIMIT.max; i++) await fastify.inject('/v1/exchange')
    const res = await fastify.inject({ method: 'POST', url: '/v1/exchange', payload: {} })
    assert.notStrictEqual(res.statusCode, 429)
  } finally {
    await fastify.close()
  }
})
