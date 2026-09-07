/**
 * `apiRoutes` ↔ the server's actual route table.
 *
 * The mapped type over `ApiContract` already makes a contract endpoint with no
 * path impossible to compile. It cannot check the path is CORRECT: the values
 * are plain strings, so `/v1/gig/:id/applications` (singular) type-checks
 * happily, serves nothing, and only shows up when a client 404s in production.
 *
 * Integration tests do not close this either — they use literal URLs, so a
 * typo'd constant and a working route coexist quite comfortably.
 *
 * This walks every declared path and asserts the server answers it on some
 * method. Gated on TEST_DATABASE_URL because it needs the real app.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { apiRoutes } from '@tenda/shared'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/**
 * The method lives in the contract TYPE, which is erased at runtime, so the
 * path is probed against every verb the API uses. Serving the path on any of
 * them is what distinguishes a real route from a typo.
 */
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const

function declaredPaths(): Array<{ key: string; path: string }> {
  const out: Array<{ key: string; path: string }> = []
  for (const [domain, endpoints] of Object.entries(apiRoutes)) {
    for (const [name, path] of Object.entries(endpoints)) {
      out.push({ key: `${domain}.${name}`, path })
    }
  }
  return out
}

test('every apiRoutes path is served by a registered route', { skip }, async () => {
  const app = getApp()
  const missing = declaredPaths().filter(
    ({ path }) => !METHODS.some((method) => app.hasRoute({ method, url: path })),
  )
  assert.deepStrictEqual(
    missing,
    [],
    `apiRoutes entries with no route behind them:\n${missing
      .map((m) => `  ${m.key} → ${m.path}`)
      .join('\n')}`,
  )
})

// Guards the guard: if `hasRoute` ever stopped discriminating, the assertion
// above would pass vacuously and this whole file would be theatre.
test('the check actually discriminates — a typo is not served', { skip }, async () => {
  const app = getApp()
  assert.strictEqual(
    METHODS.some((method) => app.hasRoute({ method, url: '/v1/gig/:id/applications' })),
    false,
  )
  assert.ok(declaredPaths().length > 40, 'the map should be substantial, not empty')
})
