/**
 * The Agent API document (v0 reads + v1 writes) ↔ the server that serves it.
 *
 * Two directions, like api-routes-drift.test.ts: every path the document
 * declares is served on the method it declares, and every response the live
 * routes produce validates against the document's CLOSED schemas — so a field
 * that reaches the wire without reaching src/agent-api fails here, and a
 * documented field the route stopped sending fails here too. Gated on
 * TEST_DATABASE_URL because it needs the real app and real rows.
 *
 * The validator is strict ajv (no coercion, no additional-property stripping),
 * deliberately NOT fastify's own — whose defaults remove unknown keys, which is
 * the one behaviour that would make this suite pass while proving nothing.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import type { ValidateFunction } from 'ajv'
import type { FastifyInstance } from 'fastify'
import { MAX_PAGINATION_LIMIT, MAX_PROXIMITY_RADIUS_KM, TENDA_RELAY_SCHEME, X402_VERSION, X_PAYMENT_HEADER, apiRoutes, type AgentTaskPaymentRequired, type GigsContract } from '@tenda/shared'
import { escrow_proofs, featured_slots, gig_applications } from '@tenda/shared/db/schema'
import {
  AGENT_API_CACHE_SECONDS,
  AGENT_API_DOCUMENT,
  AGENT_API_DOCUMENT_PATH,
} from '@server/agent-api/openapi'
import {
  TEST_CHAIN_ID_ALT,
  TEST_DB_CONFIGURED,
  attachGigDetails,
  authHeader,
  createEscrow,
  createUser,
  resetDb,
  seedAltChain,
  useTestApp,
} from '../helpers/test-app'
import { servedPaths } from '../helpers/route-table'
import { COMPONENT_REF_PREFIX, agentApiAjv } from '../helpers/agent-api-validator'
import { JSON_MEDIA_TYPE, type HttpStatus } from '@server/agent-api/paths'
import { agentTaskBody, registerAgent } from '../helpers/agent'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
const ajv = agentApiAjv()

const GIGS = apiRoutes.gigs
/** The document spells a path parameter the OpenAPI way; fastify the Express way. */
const documented = (route: string): string => route.replace(':id', '{id}')
const served = (path: string): string => path.replace('{id}', ':id')

/** The schema an operation documents for one status, compiled. */
function responseValidator(path: string, method: 'get' | 'post' = 'get', status: HttpStatus = '200'): ValidateFunction {
  const content = AGENT_API_DOCUMENT.paths[path][method]?.responses[status]?.content
  assert.ok(content !== undefined, `${method.toUpperCase()} ${path} documents no ${status} body`)
  return ajv.compile(content[JSON_MEDIA_TYPE].schema)
}

function assertValid(validate: ValidateFunction, body: unknown, label: string): void {
  assert.strictEqual(validate(body), true, `${label} drifted from the document:\n${ajv.errorsText(validate.errors, { separator: '\n' })}`)
}

type GigDetail = GigsContract['get']['response']
type Poster = Awaited<ReturnType<typeof createUser>>
const gigUrl = (id: string): string => GIGS.get.replace(':id', id)

/** An open, public gig carrying every proof-contract field the document describes. */
async function seedPublicGig(
  app: FastifyInstance,
  { requiresApproval = false }: { requiresApproval?: boolean } = {},
): Promise<{ id: string; poster: Poster }> {
  const poster = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    escrow_ref: 'ref-agent-api',
    requires_approval: requiresApproval,
  })
  await attachGigDetails(app, escrow.id, {
    proof_requirements: ['image', 'geotag', 'structured'],
    proof_params: {
      geotag: { radius_m: 500 },
      structured: { fields: [{ name: 'count', kind: 'number', required: true }] },
    },
    latitude: 6.5244,
    longitude: 3.3792,
  })
  await app.db.insert(featured_slots).values({
    escrow_id: escrow.id,
    starts_at: new Date(Date.now() - 60_000),
    ends_at: new Date(Date.now() + 3_600_000),
    position: 0,
  })
  return { id: escrow.id, poster }
}

test('every documented path is served on the method it declares, and the document is served where it says', { skip }, async () => {
  const app = getApp()
  const missing: string[] = []
  for (const [path, item] of Object.entries(AGENT_API_DOCUMENT.paths)) {
    if (item.get !== undefined && !app.hasRoute({ method: 'GET', url: served(path) })) missing.push(`GET ${path}`)
    if (item.post !== undefined && !app.hasRoute({ method: 'POST', url: served(path) })) missing.push(`POST ${path}`)
  }
  assert.deepStrictEqual(missing, [])
  assert.ok(app.hasRoute({ method: 'GET', url: AGENT_API_DOCUMENT_PATH }))
})

test('every public GET under /v1/gigs is documented — the document is the whole read surface', { skip }, async () => {
  // Bearer-only surfaces are excluded by name, so a NEW public gig route
  // fails this case until it is documented.
  const BEARER_ONLY = new Set([GIGS.applicants])
  const live = [...servedPaths(getApp())]
    .filter((path) => path.startsWith(GIGS.list) && !BEARER_ONLY.has(path))
    .sort()
  const documentedReads = Object.entries(AGENT_API_DOCUMENT.paths).filter(([, item]) => item.get !== undefined).map(([path]) => served(path))
  assert.deepStrictEqual(live, documentedReads.sort())
})

test('GET /v1/openapi.json serves the document itself, cacheable, without a bearer', { skip }, async () => {
  const response = await getApp().inject({ method: 'GET', url: AGENT_API_DOCUMENT_PATH })
  assert.strictEqual(response.statusCode, 200)
  assert.match(response.headers['content-type'] as string, /application\/json/)
  assert.strictEqual(response.headers['cache-control'], `public, max-age=${AGENT_API_CACHE_SECONDS}`)
  assert.deepStrictEqual(response.json(), JSON.parse(JSON.stringify(AGENT_API_DOCUMENT)))
})

test('the live feed, facets, featured rail and detail all validate against their closed schemas', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const { id } = await seedPublicGig(app)

  const feed = await app.inject({ method: 'GET', url: GIGS.list })
  assert.strictEqual(feed.statusCode, 200)
  assertValid(responseValidator(GIGS.list), feed.json(), `GET ${GIGS.list}`)
  assert.strictEqual(feed.json<{ total: number }>().total, 1)

  const facets = await app.inject({ method: 'GET', url: `${GIGS.facets}?country=NG` })
  assert.strictEqual(facets.statusCode, 200)
  assertValid(responseValidator(GIGS.facets), facets.json(), `GET ${GIGS.facets}`)

  const featured = await app.inject({ method: 'GET', url: GIGS.featured })
  assert.strictEqual(featured.statusCode, 200)
  assertValid(responseValidator(GIGS.featured), featured.json(), `GET ${GIGS.featured}`)

  const detail = await app.inject({ method: 'GET', url: gigUrl(id) })
  assert.strictEqual(detail.statusCode, 200)
  const body = detail.json<GigDetail>()
  assertValid(responseValidator(documented(GIGS.get)), body, `GET ${GIGS.get}`)
  // The proof contract the document exists to publish is on the wire.
  assert.deepStrictEqual(body.proof_requirements, ['image', 'geotag', 'structured'])
  assert.deepStrictEqual(body.proof_params, {
    geotag: { radius_m: 500 },
    structured: { fields: [{ name: 'count', kind: 'number', required: true }] },
  })
  // Anonymous: the party-scoped half is withheld in its documented shape.
  assert.strictEqual(body.counterparty, null)
  assert.deepStrictEqual(body.proofs, [])
  assert.strictEqual(body.viewer, null)
})

test('the bearer-scoped half validates too: proofs and the count for a PARTY, the application for an applicant', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const { id, poster } = await seedPublicGig(app, { requiresApproval: true })
  const worker = await createUser(app)
  // One proof of each class the document describes: a file, and both data shapes.
  await app.db.insert(escrow_proofs).values([
    { escrow_id: id, type: 'image', url: 'https://res.cloudinary.com/tenda/proof.jpg' },
    { escrow_id: id, type: 'geotag', payload: { latitude: 6.5244, longitude: 3.3792 } },
    { escrow_id: id, type: 'structured', payload: { values: { count: 3, verified: true, note: 'ok' } } },
  ])
  await app.db.insert(gig_applications).values({
    escrow_id: id,
    applicant_id: worker.row.id,
    message: 'I can do this',
    expires_at: new Date(Date.now() + 3_600_000),
  })
  const validate = responseValidator(documented(GIGS.get))

  const asPoster = (
    await app.inject({ method: 'GET', url: gigUrl(id), headers: authHeader(poster.token) })
  ).json<GigDetail>()
  assertValid(validate, asPoster, `GET ${GIGS.get} as the poster`)
  assert.deepStrictEqual(asPoster.proofs.map((proof) => proof.type).sort(), ['geotag', 'image', 'structured'])
  assert.deepStrictEqual(asPoster.viewer, { application: null, open_application_count: 1 })

  const asWorker = (
    await app.inject({ method: 'GET', url: gigUrl(id), headers: authHeader(worker.token) })
  ).json<GigDetail>()
  assertValid(validate, asWorker, `GET ${GIGS.get} as an applicant`)
  // An applicant is not a party: the private half stays withheld…
  assert.deepStrictEqual(asWorker.proofs, [])
  // …but their own application travels, in the GigApplication shape.
  assert.strictEqual(asWorker.viewer?.application?.status, 'open')
  assert.strictEqual(asWorker.viewer?.open_application_count, null)
})

test('the error envelope validates too, on a documented refusal', { skip }, async () => {
  const response = await getApp().inject({ method: 'GET', url: `${GIGS.list}?country=ZZ` })
  assert.strictEqual(response.statusCode, 400)
  const validate = ajv.getSchema(`${COMPONENT_REF_PREFIX}ApiError`)
  assert.ok(validate !== undefined)
  assertValid(validate, response.json(), '400 envelope')
})

test('documented parameter bounds are where the LIVE feed refuses', { skip }, async () => {
  const app = getApp()
  const feed = (query: string) => app.inject({ method: 'GET', url: `${GIGS.list}?${query}` })
  const apiError = ajv.getSchema(`${COMPONENT_REF_PREFIX}ApiError`)
  assert.ok(apiError !== undefined)
  const refused = async (query: string) => {
    const response = await feed(query)
    assert.strictEqual(response.statusCode, 400, `${query} must be refused`)
    assertValid(apiError, response.json(), `400 for ${query}`)
  }
  // radius_km: exclusive at 0, inclusive at the cap.
  await refused('lat=6&lng=3&radius_km=0')
  await refused(`lat=6&lng=3&radius_km=${MAX_PROXIMITY_RADIUS_KM + 1}`)
  assert.strictEqual((await feed(`lat=6&lng=3&radius_km=${MAX_PROXIMITY_RADIUS_KM}`)).statusCode, 200)
  // Amounts: canonical integers only.
  await refused('min_amount_raw=007')
  assert.strictEqual((await feed('min_amount_raw=0')).statusCode, 200)
  // limit: clamped to the documented maximum, never refused.
  const clamped = await feed(`limit=${MAX_PAGINATION_LIMIT + 1}`)
  assert.strictEqual(clamped.statusCode, 200)
  assert.strictEqual(clamped.json<{ limit: number }>().limit, MAX_PAGINATION_LIMIT)
})

// Guards the guard: the validators above must be able to FAIL a live body.
test('an undocumented field on a live body is refused, not stripped', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const { id } = await seedPublicGig(app)
  const body = (await app.inject({ method: 'GET', url: gigUrl(id) })).json<GigDetail>()
  const validate = responseValidator(documented(GIGS.get))
  assert.strictEqual(validate({ ...body, undocumented: true }), false)
  const { title: _dropped, ...withoutTitle } = body
  assert.strictEqual(validate(withoutTitle), false)
})

// ---------- v1: the write surface (#19) -----------------------------------------

test('v1: the live registration answer, the 402 terms and the 201 all validate against their closed schemas', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  await seedAltChain(app)
  const agent = await registerAgent(app)
  assertValid(responseValidator(apiRoutes.agent.register, 'post'), agent.response, `POST ${apiRoutes.agent.register}`)
  const body = agentTaskBody()
  const quote = await app.inject({ method: 'POST', url: apiRoutes.agent.tasks, headers: authHeader(agent.token), payload: body })
  assert.strictEqual(quote.statusCode, 402)
  assertValid(responseValidator(apiRoutes.agent.tasks, 'post', '402'), quote.json(), `POST ${apiRoutes.agent.tasks} → 402`)
  const terms = quote.json<AgentTaskPaymentRequired>().accepts[0]
  assert.ok(terms !== undefined && terms.payment.kind === 'eip155-authorization')
  const header = Buffer.from(JSON.stringify({
    x402Version: X402_VERSION, scheme: TENDA_RELAY_SCHEME, network: TEST_CHAIN_ID_ALT,
    payload: { signature: `0x${'44'.repeat(65)}`, authorization: terms.payment.typed_data.message },
  })).toString('base64')
  const created = await app.inject({ method: 'POST', url: apiRoutes.agent.tasks, headers: { ...authHeader(agent.token), [X_PAYMENT_HEADER]: header }, payload: body })
  assert.strictEqual(created.statusCode, 201, created.body)
  assertValid(responseValidator(apiRoutes.agent.tasks, 'post', '201'), created.json(), `POST ${apiRoutes.agent.tasks} → 201`)
  // The badge reaches the wire through the documented UserRef: the agent's own draft, then the public feed once open.
  const draft = await app.inject({ method: 'GET', url: gigUrl(quote.json<AgentTaskPaymentRequired>().task_id), headers: authHeader(agent.token) })
  assertValid(responseValidator(documented(GIGS.get)), draft.json(), `GET ${GIGS.get} as the agent`)
  assert.strictEqual(draft.json<GigDetail>().creator.is_agent, true)
})
