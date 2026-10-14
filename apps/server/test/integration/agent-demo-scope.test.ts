/**
 * What a DEMO bearer may reach (#177).
 *
 * The demo session hands a token to anyone who asks — no body, no proof, no
 * account. Until the scope claim that token was an ORDINARY one, and MEASURED on
 * production 2026-09-14 it read `GET /v1/exchange`: three live offers, each
 * pairing a real person's name, avatar and country with the money they were
 * moving, to a caller who had proved nothing.
 *
 * THE EXAMPLE ROUTE MOVED, and the reason is worth reading before changing it
 * back. These cases used the exchange book as their stand-in for "a gated
 * route". #179 made that book ANONYMOUS, so `authenticate` no longer runs on it
 * and the scope check never fires — a demo bearer now reads it exactly as a
 * caller with no token does, which is correct: there is no authority left to
 * withhold. Refusing a public document to a valid token would be worse than
 * anonymous. So the gated example is now `GET /v1/gigs?mine=`, whose handler
 * calls `fastify.authenticate` MID-HANDLER — which also keeps proving that the
 * scope check rides along there and not merely on preHandlers.
 *
 * These cases pin the two halves that make the fix worth having:
 *   - the demo still does everything the document offers it (the 402, and the
 *     draft read-back that follows), so scoping costs the feature nothing;
 *   - the refusal discriminates by SCOPE, not by agent-ness — a REAL agent from
 *     /v1/agent/register is unrestricted. Without that case a blanket "agents
 *     cannot read" bug would pass this file.
 *
 * `../helpers/agent-demo-env` first, for its side effect: config memoises on
 * first read, so the demo address must be set before the harness builds an app.
 */
import { DEMO_ADDRESS } from '../helpers/agent-demo-env'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_TOKEN_EXPIRES_IN,
  ErrorCode,
  apiRoutes,
  type AgentRegisterResponse,
  type AgentTaskPaymentRequired,
} from '@tenda/shared'
import { DEMO_SCOPE } from '@server/features/auth/session/scope'
import {
  TEST_DB_CONFIGURED,
  attachExchangeDetails,
  authHeader,
  createEscrow,
  createUser,
  seedAltChain,
  useTestApp,
  type TestUser,
} from '../helpers/test-app'
import { agentTaskBody, registerAgent } from '../helpers/agent'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** The documented call: POST with no body at all. */
async function demoToken(): Promise<string> {
  const res = await getApp().inject({ method: 'POST', url: apiRoutes.agent.demoSession })
  assert.strictEqual(res.statusCode, 200, res.body)
  return res.json<AgentRegisterResponse>().token
}

/** One live sell offer, so a 200 on the book means real rows, not an empty list. */
async function liveOffer(seller: TestUser): Promise<void> {
  const escrow = await createEscrow(getApp(), {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
  })
  await attachExchangeDetails(getApp(), escrow.id)
}

const MINE_URL = `${apiRoutes.gigs.list}?mine=created`

test('the demo bearer is REFUSED a gated read, and told where to get a real session', { skip }, async () => {
  // `?mine=` calls `authenticate` INSIDE the handler, so this also proves the
  // check rides along there rather than only on a preHandler.
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: MINE_URL, headers: authHeader(await demoToken()) })

  assert.strictEqual(res.statusCode, 403, res.body)
  const body = res.json<{ code: string; message: string }>()
  assert.strictEqual(body.code, ErrorCode.FORBIDDEN)
  // A dead end is what round one scored badly. The refusal has to say the way on.
  assert.match(body.message, new RegExp(apiRoutes.agent.register))
  // And no listing may ride out on the refusal.
  assert.ok(!res.body.includes('"data"'), 'a listing leaked through the refusal')

  // The public feed sends no token, so nothing about it changes.
  const open = await app.inject({ method: 'GET', url: apiRoutes.gigs.list })
  assert.strictEqual(open.statusCode, 200, open.body)
})

test('an ordinary user is unaffected — the check discriminates by SCOPE, not by who is asking', { skip }, async () => {
  const app = getApp()
  const human = await createUser(app)
  const res = await app.inject({ method: 'GET', url: MINE_URL, headers: authHeader(human.token) })
  // 200 rather than 403 IS the discrimination; an empty list is a real answer.
  assert.strictEqual(res.statusCode, 200, res.body)
})

test('a REAL agent from /v1/agent/register is unrestricted', { skip }, async () => {
  const app = getApp()
  const agent = await registerAgent(app)
  const res = await app.inject({ method: 'GET', url: MINE_URL, headers: authHeader(agent.token) })
  // The case a blanket "agents cannot read" bug would fail.
  assert.strictEqual(res.statusCode, 200, res.body)
})

/**
 * The book is PUBLIC since #179, so the scope neither grants nor withholds it.
 * Pinned anyway: a future preHandler put back on that route would silently make
 * the demo session worse than anonymous, and nothing else would notice.
 */
test('the demo bearer reads the now-public exchange book, exactly as anonymous does', { skip }, async () => {
  const app = getApp()
  await liveOffer(await createUser(app))
  const token = await demoToken()

  const withToken = await app.inject({ method: 'GET', url: apiRoutes.exchange.list, headers: authHeader(token) })
  const anonymous = await app.inject({ method: 'GET', url: apiRoutes.exchange.list })
  assert.strictEqual(withToken.statusCode, 200, withToken.body)
  assert.strictEqual(anonymous.statusCode, 200, anonymous.body)
  assert.deepStrictEqual(
    withToken.json<{ data: unknown[] }>().data,
    anonymous.json<{ data: unknown[] }>().data,
    'a demo bearer must read the public book neither better nor worse than anonymous',
  )
})

test('the demo bearer still REACHES THE 402 — the step every round-one reviewer missed', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const token = await demoToken()
  const res = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(token),
    payload: agentTaskBody(),
  })
  assert.strictEqual(res.statusCode, 402, res.body)
  const quote = res.json<AgentTaskPaymentRequired>()
  assert.strictEqual(quote.accepts[0].payment.creator.toLowerCase(), DEMO_ADDRESS.toLowerCase())
})

test('the demo bearer still reads its OWN draft back — the documented poll after the 402', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const token = await demoToken()
  const quoted = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(token),
    payload: agentTaskBody(),
  })
  assert.strictEqual(quoted.statusCode, 402, quoted.body)
  const { escrow_id } = quoted.json<AgentTaskPaymentRequired>().accepts[0]

  // This works because `gigs.get` is ALLOW-LISTED, not because the scope is
  // bypassed. The route's preHandler is `identifyViewer`, but its DRAFT branch
  // calls `fastify.authenticate` mid-handler (routes/v1/gigs/_id/index.ts) so
  // suspended accounts are rejected there too — and an agent's quoted task is
  // always a draft. Omitting it from the list refused this poll, which is how
  // the entry was found.
  // Derived from the route CONSTANT, like every other url in this suite — the
  // sibling agent tests never type a path, and `apiRoutes.gigs.get` is the same
  // value the allow-list matches on, so the two cannot drift apart.
  const detailUrl = apiRoutes.gigs.get.replace(':id', escrow_id)
  const draft = await app.inject({ method: 'GET', url: detailUrl, headers: authHeader(token) })
  assert.strictEqual(draft.statusCode, 200, draft.body)
  const anon = await app.inject({ method: 'GET', url: detailUrl })
  assert.strictEqual(anon.statusCode, 404, 'a draft must stay invisible to strangers')
})

test('the demo token carries the scope claim and a SHORT life, not the 7-day default', { skip }, async () => {
  const app = getApp()
  const claims = app.jwt.decode<{ scope?: string; iat: number; exp: number }>(await demoToken())
  assert.ok(claims !== null)
  assert.strictEqual(claims.scope, DEMO_SCOPE)
  // Compared against a REAL ordinary session rather than a number typed here:
  // the invariant is "materially shorter than what everyone else gets", and a
  // literal would have to be edited in step with `JWT_EXPIRES_IN` by someone who
  // remembered this file existed.
  //
  // The comparison token comes from `/v1/agent/register`, NOT from `createUser`:
  // the fixture signs `{ id, role }` directly with no `expiresIn`, so its token
  // carries no `exp` at all and any comparison against it comes out NaN — which
  // is how the first version of this assertion compared against nothing. A
  // registration is a real unscoped session through the same `mintAuthResponse`,
  // so the two lifetimes are produced by one code path and differ only by scope.
  const ordinary = app.jwt.decode<{ scope?: string; iat: number; exp: number }>(
    (await registerAgent(app)).token,
  )
  assert.ok(ordinary !== null)
  const demoLife = claims.exp - claims.iat
  const ordinaryLife = ordinary.exp - ordinary.iat
  assert.ok(Number.isFinite(ordinaryLife), 'the ordinary token must carry an expiry to compare against')
  assert.ok(
    demoLife < ordinaryLife,
    `demo token lived ${demoLife}s against an ordinary ${ordinaryLife}s — ${DEMO_TOKEN_EXPIRES_IN} was intended`,
  )
  assert.strictEqual(ordinary.scope, undefined, 'an ordinary session must carry no scope claim')
})
