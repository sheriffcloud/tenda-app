/**
 * The other half of #108: a deployment that configures NO demo address.
 *
 * Its own suite because `getConfig()` memoises on first read — one process
 * cannot answer both ways — and worth a suite at all because the failure it
 * guards is silent: an unset address with a permissive fallback would invent a
 * creator, and the terms built for an invented address are unsignable. A 503
 * that names the missing variable is the honest answer, and it is what a
 * deployment gets by DEFAULT, since nothing here sets the variable.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ErrorCode, apiRoutes } from '@tenda/shared'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('with no demo address configured the route answers 503 and names the variable', { skip }, async () => {
  const response = await getApp().inject({ method: 'POST', url: apiRoutes.agent.demoSession })
  assert.strictEqual(response.statusCode, 503, response.body)
  const body = response.json<{ code: string; message: string }>()
  assert.strictEqual(body.code, ErrorCode.SERVICE_UNAVAILABLE)
  assert.match(body.message, /AGENT_DEMO_ADDRESS/, 'the refusal must say what to set')
  assert.match(body.message, new RegExp(apiRoutes.agent.register), 'and where a real agent registers instead')
})

test('the route is SERVED even when unconfigured — a 503 is an answer, a 404 would be drift', { skip }, async () => {
  // The document promises this path. If an unset variable removed the route,
  // the document would be describing something that is not there, which is
  // the exact failure mode its drift guard exists to catch.
  assert.ok(getApp().hasRoute({ method: 'POST', url: apiRoutes.agent.demoSession }))
})
