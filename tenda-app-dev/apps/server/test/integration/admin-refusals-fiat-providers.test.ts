/**
 * Admin fiat-PROVIDER refusals that no test executed (#105 T5c).
 *
 * The registry half of routes/v1/admin/fiat.ts. Two type guards on PATCH
 * /providers/:id had never run, and the GET that lists the registry had never
 * been called at all.
 *
 * WHY THE TWO GUARDS ARE NOT COSMETIC. `is_enabled` and `priority` go straight
 * into an UPDATE on the row that ROUTING reads: `is_enabled` decides whether a
 * provider can take traffic and `priority` decides which one is preferred. A
 * non-boolean or a negative priority accepted here is a routing decision made
 * from junk, and the column types would not stop `priority: -1`.
 *
 * SEPARATE FILE FROM THE INTENTS because the two halves share only a URL
 * prefix: providers are a small registry keyed by a TEXT id, intents are the
 * money rows keyed by uuid. The route file itself makes the same distinction —
 * its uuid guard is applied per-route rather than plugin-wide, precisely so
 * `/providers/p2p_internal` is not 404ed by a uuid check.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { fiat_providers } from '@tenda/shared/db/schema/fiat'
import { TEST_DB_CONFIGURED, useTestApp, createAdmin, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const PROVIDERS = '/v1/admin/fiat/providers'
/** The one provider the harness seeds — a TEXT id, deliberately not a uuid. */
const SEEDED = 'p2p_internal'

test('fiat providers: the registry lists, and the seeded provider is in it', { skip }, async () => {
  // The control for everything below, and it had never run: without it the
  // refusals are satisfiable by a route that rejects every request.
  const app = getApp()
  const a = await createAdmin(app)

  const res = await app.inject({ method: 'GET', url: PROVIDERS, headers: authHeader(a.token) })
  assert.strictEqual(res.statusCode, 200, res.body)
  const ids = res.json().providers.map((p: { id: string }) => p.id)
  assert.ok(ids.includes(SEEDED), `expected ${SEEDED} in ${JSON.stringify(ids)}`)
})

test('fiat providers: is_enabled must be a boolean', { skip }, async () => {
  // 'false' and 0 are the dangerous ones: both are the shapes a form or a query
  // string produces for "off", and both would be TRUTHY or coerced if the guard
  // let them through — disabling a provider by accident, or failing to.
  const app = getApp()
  const a = await createAdmin(app)

  for (const is_enabled of ['false', 'true', 0, 1, null]) {
    const res = await app.inject({
      method: 'PATCH', url: `${PROVIDERS}/${SEEDED}`, headers: authHeader(a.token),
      payload: { is_enabled },
    })
    assert.strictEqual(res.statusCode, 422, String(is_enabled))
    assert.match(res.json().message, /^is_enabled must be a boolean$/)
  }
})

test('fiat providers: priority must be a non-negative integer', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)

  for (const priority of [-1, 1.5, '10', Number.NaN, null]) {
    const res = await app.inject({
      method: 'PATCH', url: `${PROVIDERS}/${SEEDED}`, headers: authHeader(a.token),
      payload: { priority },
    })
    assert.strictEqual(res.statusCode, 422, String(priority))
    assert.match(res.json().message, /^priority must be a non-negative integer$/)
  }

  // Zero is legal and is the value a `> 0` guard would wrongly refuse — it means
  // "most preferred", so refusing it would make the top of the routing order
  // unreachable.
  const zero = await app.inject({
    method: 'PATCH', url: `${PROVIDERS}/${SEEDED}`, headers: authHeader(a.token),
    payload: { priority: 0 },
  })
  assert.strictEqual(zero.statusCode, 200, zero.body)
  assert.strictEqual(zero.json().provider.priority, 0)

  // Restore the seeded value so this file leaves the registry as it found it —
  // other suites route against it.
  const restored = await app.inject({
    method: 'PATCH', url: `${PROVIDERS}/${SEEDED}`, headers: authHeader(a.token),
    payload: { priority: 100 },
  })
  assert.strictEqual(restored.statusCode, 200, restored.body)
  const [row] = await app.db.select().from(fiat_providers).where(eq(fiat_providers.id, SEEDED))
  assert.strictEqual(row.priority, 100)
  assert.strictEqual(row.is_enabled, true)
})
