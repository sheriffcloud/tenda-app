/**
 * `scopeAllows` on its own — the decisions the integration suite exercises
 * through HTTP, plus the one it cannot reach.
 *
 * The fail-closed case is the reason this file exists. `routeUrl` comes from
 * `request.routeOptions.url`, which Fastify fills for a matched route; a scoped
 * token arriving where that is absent must be DENIED rather than waved through,
 * and no integration test can produce that state on purpose. Getting it the
 * other way round would turn any unmatched-route path into a hole exactly for
 * the token that must not have one.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from '@tenda/shared'
import { DEMO_SCOPE, DEMO_SCOPE_ROUTES, scopeAllows } from '@server/features/auth/session/scope'

test('an UNSCOPED token is unrestricted — the ordinary session, a real agent included', () => {
  assert.equal(scopeAllows(undefined, apiRoutes.agent.tasks), true)
  assert.equal(scopeAllows(undefined, apiRoutes.exchange.list), true)
  // Even with no route to name: an unscoped token was never restricted, so
  // there is nothing to fail closed ABOUT.
  assert.equal(scopeAllows(undefined, undefined), true)
})

/**
 * The two routes are NAMED, not looped over `DEMO_SCOPE_ROUTES`. `scopeAllows`
 * IS `DEMO_SCOPE_ROUTES.includes(...)`, so iterating that list and asserting
 * true is a tautology: it passes for any list, an EMPTY one included, which
 * would leave the demo unable to do the one thing it exists for. Naming them is
 * what makes this able to fail.
 */
test('a demo token reaches the quote and its own draft, and nothing else', () => {
  assert.equal(scopeAllows(DEMO_SCOPE, apiRoutes.agent.tasks), true, 'the 402 quote')
  assert.equal(scopeAllows(DEMO_SCOPE, apiRoutes.gigs.get), true, 'the documented poll')
  assert.equal(scopeAllows(DEMO_SCOPE, apiRoutes.exchange.list), false)
  assert.equal(scopeAllows(DEMO_SCOPE, apiRoutes.gigs.list), false)
  assert.equal(scopeAllows(DEMO_SCOPE, apiRoutes.agent.register), false)
  // The list stays short enough to read — the property the docblock claims.
  assert.equal(DEMO_SCOPE_ROUTES.length, 2)
})

test('a demo token FAILS CLOSED when the route cannot be named', () => {
  assert.equal(scopeAllows(DEMO_SCOPE, undefined), false)
})

/**
 * The pattern, not the request path. Fastify hands `authenticate` the
 * REGISTERED url, so a caller cannot reach a listed route by dressing an
 * unlisted one up to look like it.
 */
test('matching is on the registered pattern, so a lookalike path does not widen it', () => {
  assert.equal(scopeAllows(DEMO_SCOPE, `${apiRoutes.agent.tasks}/../exchange`), false)
  assert.equal(scopeAllows(DEMO_SCOPE, `${apiRoutes.agent.tasks}?x=1`), false)
  assert.equal(
    scopeAllows(DEMO_SCOPE, apiRoutes.gigs.get.replace(':id', 'abc')),
    false,
    'a REQUEST path with the id filled in is not the registered pattern',
  )
})
