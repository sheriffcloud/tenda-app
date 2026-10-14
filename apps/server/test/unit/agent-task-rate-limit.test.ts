/**
 * POST /v1/agent/tasks is limited in TWO layers (#37): an ACCOUNT allowance of
 * 10 a minute wherever the agent calls from, and a per-IP OUTER bound of 30 so
 * free-to-mint accounts cannot each carry a fresh allowance.
 *
 * The REAL route behind the REAL limiter. `authenticate` is a stub that reads
 * the account from a header (the real one is covered by its own suites); the
 * handler's database does not exist here and answers 500, which is fine — the
 * limiters run BEFORE it, so "not 429" is what an allowed request is.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import Fastify, { type FastifyInstance } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import rateLimitPlugin from '@server/plugins/rate-limit'
import tasksRoute from '@server/routes/v1/agent/tasks'
import registerRoute from '@server/routes/v1/agent/register'
import validateRoute from '@server/routes/v1/agent/tasks/validate'
import { registerErrorHandlers } from '@server/lib/errors/http'
import {
  AGENT_TASK_ACCOUNT_RATE_LIMIT,
  AGENT_TASK_IP_RATE_LIMIT,
  AGENT_VALIDATE_ACCOUNT_RATE_LIMIT,
  AGENT_VALIDATE_IP_RATE_LIMIT,
} from '@server/lib/http/rate-limits'
import { accountRateLimit } from '@server/lib/http/account-rate-limit'

const ACCOUNT_MAX = AGENT_TASK_ACCOUNT_RATE_LIMIT.max
const IP_MAX = AGENT_TASK_IP_RATE_LIMIT.max

async function app() {
  const fastify = Fastify()
  registerErrorHandlers(fastify)
  fastify.decorate('authenticate', async (request: { headers: Record<string, unknown>; user: unknown }) => {
    request.user = { id: String(request.headers['x-account']) }
  })
  await fastify.register(rateLimitPlugin)
  await fastify.register(tasksRoute, { prefix: '/v1/agent/tasks' })
  await fastify.register(registerRoute, { prefix: '/v1/agent/register' })
  await fastify.register(validateRoute, { prefix: '/v1/agent/tasks/validate' })
  await fastify.ready()
  return fastify
}

const post = (fastify: FastifyInstance, account: string, ip: string) =>
  fastify.inject({ method: 'POST', url: '/v1/agent/tasks', headers: { 'x-account': account }, remoteAddress: ip, payload: {} })

test('the numbers: 10 an account, 30 an IP, and the IP bound is the larger', () => {
  assert.strictEqual(ACCOUNT_MAX, 10)
  assert.strictEqual(IP_MAX, 30)
  assert.ok(IP_MAX > ACCOUNT_MAX)
})

test('one account is stopped at its allowance, with the house 429 and retry_after', async () => {
  const fastify = await app()
  try {
    for (let i = 0; i < ACCOUNT_MAX; i++) {
      assert.notStrictEqual((await post(fastify, 'a', '10.0.0.1')).statusCode, 429, `request ${i + 1}`)
    }
    const over = await post(fastify, 'a', '10.0.0.1')
    assert.strictEqual(over.statusCode, 429)
    const body = over.json<{ code: string; details: { retry_after: number } }>()
    assert.strictEqual(body.code, ErrorCode.RATE_LIMITED)
    assert.ok(body.details.retry_after > 0 && body.details.retry_after <= 60)
    assert.strictEqual(over.headers['retry-after'], String(body.details.retry_after))
  } finally {
    await fastify.close()
  }
})

test('two accounts behind ONE IP have separate allowances', async () => {
  const fastify = await app()
  try {
    for (let i = 0; i < ACCOUNT_MAX; i++) await post(fastify, 'a', '10.0.0.1')
    assert.strictEqual((await post(fastify, 'a', '10.0.0.1')).statusCode, 429)
    assert.notStrictEqual((await post(fastify, 'b', '10.0.0.1')).statusCode, 429)
  } finally {
    await fastify.close()
  }
})

test('one account across IPs shares ONE allowance', async () => {
  const fastify = await app()
  try {
    for (let i = 0; i < ACCOUNT_MAX; i++) await post(fastify, 'a', `10.0.1.${i + 1}`)
    assert.strictEqual((await post(fastify, 'a', '10.0.9.9')).statusCode, 429)
  } finally {
    await fastify.close()
  }
})

test('the IP outer bound still applies: fresh accounts cannot multiply it', async () => {
  const fastify = await app()
  try {
    for (let i = 0; i < IP_MAX; i++) {
      assert.notStrictEqual((await post(fastify, `fresh-${i}`, '10.0.2.1')).statusCode, 429, `request ${i + 1}`)
    }
    const over = await post(fastify, 'fresh-extra', '10.0.2.1')
    assert.strictEqual(over.statusCode, 429)
    assert.strictEqual(over.json<{ code: string }>().code, ErrorCode.RATE_LIMITED)
  } finally {
    await fastify.close()
  }
})

test('an unauthenticated route is untouched: register keeps its per-IP limit and never reads an account', async () => {
  const fastify = await app()
  try {
    // No x-account header and no user: if the account layer were wired here it would throw on request.user.
    for (let i = 0; i < 10; i++) {
      const res = await fastify.inject({ method: 'POST', url: '/v1/agent/register', remoteAddress: '10.0.3.1', payload: {} })
      assert.notStrictEqual(res.statusCode, 429, `request ${i + 1}`)
    }
    const over = await fastify.inject({ method: 'POST', url: '/v1/agent/register', remoteAddress: '10.0.3.1', payload: {} })
    assert.strictEqual(over.statusCode, 429)
  } finally {
    await fastify.close()
  }
})

test('without the rate-limit plugin the route still registers and answers (the HTTP harness builds no limiter)', async () => {
  const fastify = Fastify()
  registerErrorHandlers(fastify)
  fastify.decorate('authenticate', async (request: { user: unknown }) => {
    request.user = { id: 'a' }
  })
  await fastify.register(tasksRoute, { prefix: '/v1/agent/tasks' })
  await fastify.ready()
  try {
    for (let i = 0; i <= ACCOUNT_MAX; i++) {
      assert.notStrictEqual((await post(fastify, 'a', '10.0.4.1')).statusCode, 429)
    }
  } finally {
    await fastify.close()
  }
})

test('validate-only has its own, larger allowance (60 an account, 120 an IP) and the same two layers', async () => {
  assert.deepStrictEqual({ ...AGENT_VALIDATE_ACCOUNT_RATE_LIMIT }, { max: 60, timeWindow: '1 minute' })
  assert.deepStrictEqual({ ...AGENT_VALIDATE_IP_RATE_LIMIT }, { max: 120, timeWindow: '1 minute' })
  assert.ok(AGENT_VALIDATE_IP_RATE_LIMIT.max > AGENT_VALIDATE_ACCOUNT_RATE_LIMIT.max)
  assert.ok(AGENT_VALIDATE_ACCOUNT_RATE_LIMIT.max > ACCOUNT_MAX, 'cheaper call, larger allowance')
  const fastify = await app()
  const validate = (account: string, ip: string) =>
    fastify.inject({ method: 'POST', url: '/v1/agent/tasks/validate', headers: { 'x-account': account }, remoteAddress: ip, payload: {} })
  try {
    for (let i = 0; i < AGENT_VALIDATE_ACCOUNT_RATE_LIMIT.max; i++) {
      assert.notStrictEqual((await validate('v', '10.0.5.1')).statusCode, 429, `request ${i + 1}`)
    }
    assert.strictEqual((await validate('v', '10.0.5.1')).statusCode, 429)
    // Its bucket is its own: the one-shot for the same account is untouched.
    assert.notStrictEqual((await post(fastify, 'v', '10.0.5.1')).statusCode, 429)
  } finally {
    await fastify.close()
  }
})

test('validate-only is bounded per IP at its own 120, however many accounts share the address', async () => {
  const fastify = await app()
  const validate = (account: string) =>
    fastify.inject({ method: 'POST', url: '/v1/agent/tasks/validate', headers: { 'x-account': account }, remoteAddress: '10.0.6.1', payload: {} })
  try {
    // A fresh account every time, so no account allowance is ever the thing that stops it.
    for (let i = 0; i < AGENT_VALIDATE_IP_RATE_LIMIT.max; i++) {
      assert.notStrictEqual((await validate(`acct-${i}`)).statusCode, 429, `request ${i + 1}`)
    }
    assert.strictEqual((await validate('acct-over')).statusCode, 429)
  } finally {
    await fastify.close()
  }
})

test('the bucket is per ROUTE as well as per account: exhausting one route leaves another open', async () => {
  // Only one route uses the limiter today, so this builds two: the key's route
  // segment is the only thing keeping a future second route from draining the first.
  const fastify = Fastify()
  registerErrorHandlers(fastify)
  fastify.decorate('authenticate', async (request: { headers: Record<string, unknown>; user: unknown }) => {
    request.user = { id: String(request.headers['x-account']) }
  })
  await fastify.register(rateLimitPlugin)
  const limit = { max: 2, timeWindow: '1 minute' } as const
  for (const path of ['/one', '/two']) {
    fastify.get(path, { preHandler: [fastify.authenticate, accountRateLimit(fastify, limit)] }, async () => ({ ok: true }))
  }
  await fastify.ready()
  try {
    const hit = (url: string) => fastify.inject({ method: 'GET', url, headers: { 'x-account': 'a' }, remoteAddress: '10.0.0.9' })
    assert.strictEqual((await hit('/one')).statusCode, 200)
    assert.strictEqual((await hit('/one')).statusCode, 200)
    assert.strictEqual((await hit('/one')).statusCode, 429)
    assert.strictEqual((await hit('/two')).statusCode, 200, 'a second route has its own bucket')
  } finally {
    await fastify.close()
  }
})
