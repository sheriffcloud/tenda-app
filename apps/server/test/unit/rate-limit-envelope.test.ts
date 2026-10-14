/**
 * A throttled request answers in the house error envelope with its OWN code.
 *
 * It used to answer `code: "INTERNAL_ERROR"` and `error: "Error"` (the library's
 * default object, run through the generic branch of the error handler), so a
 * client that branches on `code` read a client-side throttle as a server fault.
 * Run through the real plugin and the real error handlers, so a change to either
 * shows up here.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import Fastify from 'fastify'
import { ErrorCode } from '@tenda/shared'
import rateLimitPlugin from '@server/plugins/rate-limit'
import { registerErrorHandlers } from '@server/lib/errors/http'

async function app(routeMax?: number) {
  const fastify = Fastify()
  registerErrorHandlers(fastify)
  await fastify.register(rateLimitPlugin)
  fastify.get('/ping', routeMax === undefined ? {} : { config: { rateLimit: { max: routeMax, timeWindow: '1 minute' } } }, async () => ({ ok: true }))
  await fastify.ready()
  return fastify
}

test('the request over the limit answers 429 RATE_LIMITED, labelled, with retry_after', async () => {
  const fastify = await app(1)
  try {
    assert.strictEqual((await fastify.inject('/ping')).statusCode, 200)
    const res = await fastify.inject('/ping')
    assert.strictEqual(res.statusCode, 429)
    const body = res.json<{ statusCode: number; error: string; code: string; message: string; details: { retry_after: number } }>()
    assert.strictEqual(body.code, ErrorCode.RATE_LIMITED)
    assert.strictEqual(body.error, 'Too Many Requests')
    assert.strictEqual(body.statusCode, 429)
    assert.match(body.message, /rate limit/i)
    assert.ok(Number.isInteger(body.details.retry_after) && body.details.retry_after > 0 && body.details.retry_after <= 60)
    assert.strictEqual(res.headers['retry-after'], String(body.details.retry_after))
  } finally {
    await fastify.close()
  }
})

test('a request under the limit is untouched', async () => {
  const fastify = await app(2)
  try {
    const res = await fastify.inject('/ping')
    assert.strictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.json(), { ok: true })
  } finally {
    await fastify.close()
  }
})

test('RATE_LIMITED is distinct from the OTP-specific code, which keeps its meaning', () => {
  assert.notStrictEqual(ErrorCode.RATE_LIMITED, ErrorCode.OTP_RATE_LIMITED)
})
