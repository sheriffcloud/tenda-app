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
import { randomUUID } from 'node:crypto'
import type { ValidateFunction } from 'ajv'
import type { FastifyInstance } from 'fastify'
import { CHAIN_MANIFEST, MAX_PAGINATION_LIMIT, MAX_PROXIMITY_RADIUS_KM, TENDA_RELAY_SCHEME, X402_VERSION, X_PAYMENT_HEADER, apiRoutes, buildAuthMessage, type AgentTaskPaymentRequired, type AuthNonceResponse, type GigsContract, type PlatformContract } from '@tenda/shared'
import { assets, chains, escrow_proofs, featured_slots, gig_applications } from '@tenda/shared/db/schema'
import {
  AGENT_API_CACHE_SECONDS,
  AGENT_API_DOCUMENT,
  AGENT_API_AGENT_PATH,
  AGENT_API_DOCUMENT_PATH,
  AGENT_API_STABILITY,
  JSON_MEDIA_TYPE,
  type HttpStatus,
} from '@tenda/api-doc'
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
import { COMPONENT_REF_PREFIX, agentApiAjv } from '@tenda/api-doc/testing'
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

/** The POST operation a path documents — asserted present, so a rename fails loudly. */
function operation(path: string): NonNullable<(typeof AGENT_API_DOCUMENT)['paths'][string]['post']> {
  const post = AGENT_API_DOCUMENT.paths[path]?.post
  assert.ok(post !== undefined, `the document declares no POST ${path}`)
  return post
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
  // Both sides are narrowed to the gig surface this case is about. The document
  // also carries GET /v1/platform/chains (#126), which is not a gig read; that
  // it is SERVED is proved by the every-documented-path case above, so widening
  // this comparison would only make it a second, weaker copy of that one.
  const documentedReads = Object.entries(AGENT_API_DOCUMENT.paths)
    .filter(([, item]) => item.get !== undefined)
    .map(([path]) => served(path))
    .filter((path) => path.startsWith(GIGS.list))
  assert.deepStrictEqual(live, documentedReads.sort())
})

test('GET /v1/openapi.json serves the document itself, cacheable, without a bearer', { skip }, async () => {
  const response = await getApp().inject({ method: 'GET', url: AGENT_API_DOCUMENT_PATH })
  assert.strictEqual(response.statusCode, 200)
  assert.match(response.headers['content-type'] as string, /application\/json/)
  assert.strictEqual(response.headers['cache-control'], `public, max-age=${AGENT_API_CACHE_SECONDS}`)
  assert.deepStrictEqual(response.json(), JSON.parse(JSON.stringify(AGENT_API_DOCUMENT)))
})

/**
 * The agent path (#110) was where the agent-only subset lived; the subset is
 * retired (#135) but the URL was handed out, so it must keep answering — and
 * answering the SAME bytes as the canonical path, or a reader who was given
 * one URL integrates against something the other does not say.
 */
test('GET /v1/agent/openapi.json serves the identical document, cacheable, without a bearer', { skip }, async () => {
  const alias = await getApp().inject({ method: 'GET', url: AGENT_API_AGENT_PATH })
  const canonical = await getApp().inject({ method: 'GET', url: AGENT_API_DOCUMENT_PATH })
  assert.strictEqual(alias.statusCode, 200)
  assert.match(alias.headers['content-type'] as string, /application\/json/)
  assert.strictEqual(alias.headers['cache-control'], `public, max-age=${AGENT_API_CACHE_SECONDS}`)
  // Bytes, not parsed shapes: serialisation happens between the constant and
  // the wire, and the promise is that both URLs hand a reader the same file.
  assert.strictEqual(alias.rawPayload.toString(), canonical.rawPayload.toString())
})

test('every path+method the document promises is one this server actually serves', { skip }, async () => {
  // The drift that matters at runtime: a document naming a route that 404s is
  // worse than no document, because an agent integrates against it.
  //
  // Driven by the METHOD the document declares, not a blanket GET — the two
  // agent paths are POST-only, and Fastify answers an unmatched method with
  // 404, so a GET sweep would report them missing when they are there.
  //
  // "Served" cannot be `statusCode !== 404`, because a real route answers 404
  // for a resource that is absent. MEASURED, both shapes on this app: a missing
  // gig is `{code:'NOT_FOUND', message:'Gig not found'}`, while an unrouted URL
  // is `{code:'INTERNAL_ERROR', message:'Route GET /... not found'}`. The
  // message prefix is the discriminator, so this passes for an unauthenticated
  // POST (401) and an unknown id (404) and fails only when nothing is mounted.
  for (const [path, item] of Object.entries(AGENT_API_DOCUMENT.paths)) {
    const url = path.replace('{id}', '00000000-0000-4000-8000-000000000000')
    for (const method of ['get', 'post'] as const) {
      if (item[method] === undefined) continue
      const response = await getApp().inject({ method: method.toUpperCase() as 'GET' | 'POST', url })
      const body = response.json() as { message?: string }
      assert.ok(
        !/^Route /.test(body.message ?? ''),
        `${method.toUpperCase()} ${path} is documented but not served (${body.message})`,
      )
    }
  }
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

/**
 * resetDb + the alt chain + the served list, which all three deployment-truth
 * cases start from. One helper instead of three copies, and it asserts the
 * response validates so every caller below can trust the shape it walks.
 */
async function servedChains(app: FastifyInstance): Promise<PlatformContract['chains']['response']['data']> {
  await resetDb(app)
  await seedAltChain(app)
  const response = await app.inject({ method: 'GET', url: apiRoutes.platform.chains })
  assert.strictEqual(response.statusCode, 200)
  const body = response.json<PlatformContract['chains']['response']>()
  assertValid(responseValidator(apiRoutes.platform.chains), body, `GET ${apiRoutes.platform.chains}`)
  return body.data
}

test('the chain list is the DEPLOYMENT\'s, not the manifest\'s', { skip }, async () => {
  const app = getApp()
  const data = await servedChains(app)

  // #126, asserted rather than described. Every id served is one this app's
  // adapter REGISTRY holds — the deployment fact — and the manifest has entries
  // the response does not, which is what makes the two provably different
  // sources at all. A route that served the manifest instead would fail the
  // FIRST of these: it would offer `solana:mainnet`, which no adapter backs.
  // The second is the precondition, not a second catch.
  const served = data.map((entry) => entry.id)
  assert.ok(served.length > 0, 'the harness enables at least one chain')
  for (const id of served) assert.ok(app.chains.has(id), `${id} is served but this deployment has no adapter for it`)
  const unserved = CHAIN_MANIFEST.filter((entry) => !served.includes(entry.id))
  assert.ok(
    unserved[0] !== undefined,
    'the manifest and this deployment agree exactly, so this guard cannot tell them apart — enable fewer chains in the harness',
  )

  // ENACTED rather than assumed. Removing the route's registry filter changed
  // nothing on its own — the harness enables exactly the chains it has adapters
  // for, so the two sources were indistinguishable. Insert a manifest chain the
  // deployment has no adapter for, ENABLED in the database, and a server that
  // answered from the database alone would now advertise it.
  await app.db.insert(chains).values({
    id: unserved[0].id,
    namespace: unserved[0].namespace,
    display_name: unserved[0].displayName,
    min_confirmations: 1,
    treasury_address: '',
    escrow_program: '',
  })
  const after = await app.inject({ method: 'GET', url: apiRoutes.platform.chains })
  assert.strictEqual(after.statusCode, 200)
  const servedAfter = after.json<PlatformContract['chains']['response']>().data.map((entry) => entry.id)
  assert.ok(!app.chains.has(unserved[0].id), 'the fixture chain must genuinely have no adapter')
  assert.deepStrictEqual(
    servedAfter,
    served,
    `${unserved[0].id} is enabled in the database with no adapter — it must not be advertised`,
  )
})

test('each asset says what it may be USED for, and the validator agrees', { skip }, async () => {
  const app = getApp()
  // #129. The wall a reviewer hit on production: the chain list showed cUSD,
  // the task post refused it, and nothing in the response said which of the
  // listed assets a gig actually takes.
  await servedChains(app)
  await app.db.insert(assets).values([
    // Exchange-only on this chain, so a gig must refuse it.
    { id: 'ETH_BASE', chain_id: TEST_CHAIN_ID_ALT, symbol: 'ETH', decimals: 18, token_address: null, is_stable: false },
    // An asset the MANIFEST does not know: the empty case of the new field.
    { id: 'GHOST_ASSET', chain_id: TEST_CHAIN_ID_ALT, symbol: 'GHOST', decimals: 9, token_address: '0xghost', is_stable: false },
  ])
  const listed = (await app.inject({ method: 'GET', url: apiRoutes.platform.chains }))
    .json<PlatformContract['chains']['response']>().data.find((entry) => entry.id === TEST_CHAIN_ID_ALT)
  assert.ok(listed !== undefined, `${TEST_CHAIN_ID_ALT} is served`)

  const gigAssets = listed.assets.filter((asset) => asset.roles.includes('gig'))
  assert.strictEqual(gigAssets.length, 1, 'a chain publishes exactly ONE gig asset — the validator accepts exactly one')
  // "Listed, usable for nothing here" — kept in the list rather than dropped,
  // because the wallet screen still has to show a balance the user holds; the
  // field is what separates listed from usable.
  const ghost = listed.assets.find((asset) => asset.id === 'GHOST_ASSET')
  assert.ok(ghost !== undefined, 'an enabled asset the manifest does not know must still be LISTED')
  assert.deepStrictEqual(ghost.roles, [], 'it is usable for nothing here, and must say so rather than omit the field')

  // And the roles are the ones the WRITE path honours, proven by using them.
  const notGig = listed.assets.find((asset) => !asset.roles.includes('gig'))
  assert.ok(notGig !== undefined, 'the fixture must offer a listed non-gig asset, or the refusal below proves nothing')
  const registered = await registerAgent(app)
  const wrongAsset = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(registered.token),
    payload: { ...agentTaskBody(), asset: notGig.id, creation_operation_id: randomUUID() },
  })
  assert.strictEqual(wrongAsset.statusCode, 422, wrongAsset.body)
  assert.match(wrongAsset.body, new RegExp(`must use '${gigAssets[0].id}'`), wrongAsset.body)
})

test('a chain the list omits is refused with the status the stability note promises', { skip }, async () => {
  const app = getApp()
  const data = await servedChains(app)
  const served = data.map((entry) => entry.id)
  const unserved = CHAIN_MANIFEST.filter((entry) => !served.includes(entry.id))
  assert.ok(unserved[0] !== undefined, 'the manifest must hold a chain this deployment does not serve')

  // The document does not promise those chains anywhere: the chain id scalar is
  // shape-checked, and points at the endpoint instead.
  const chainIdSchema = AGENT_API_DOCUMENT.components.schemas.AgentTaskBody.properties?.chain_id
  assert.strictEqual(chainIdSchema?.enum, undefined)
  assert.match(chainIdSchema?.description ?? '', /\/v1\/platform\/chains/)

  // MEASURED, because the first version of that note said 400 for both paths —
  // 400 is what the FEED filter answers; the task post answers 422, and an
  // agent coded against the note would watch for a status it never receives.
  const registered = await registerAgent(app)
  const refused = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(registered.token),
    payload: { ...agentTaskBody(), chain_id: unserved[0].id },
  })
  // On the MESSAGE too, so a 422 earned by some other invalid field cannot
  // stand in for the refusal this case is about.
  assert.match(refused.body, new RegExp(`unsupported chain_id.*${unserved[0].id}`), refused.body)
  const status = String(refused.statusCode) as HttpStatus
  const note = AGENT_API_STABILITY.find((line) => line.includes(apiRoutes.platform.chains))
  assert.ok(note !== undefined, 'no stability note points readers at the chain list')
  assert.ok(note.includes(status), `the stability note does not name ${status}, which is what the server answers`)
  assert.ok(
    AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasks].post?.responses[status] !== undefined,
    `${status} is what the server answers and the path item does not document it`,
  )
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
  // Validate-only (2.1.0): the live 200 is the closed schema, and a live refusal is the documented envelope.
  const validated = await app.inject({ method: 'POST', url: apiRoutes.agent.tasksValidate, headers: authHeader(agent.token), payload: body })
  assert.strictEqual(validated.statusCode, 200, validated.body)
  assertValid(responseValidator(apiRoutes.agent.tasksValidate, 'post', '200'), validated.json(), `POST ${apiRoutes.agent.tasksValidate} → 200`)
  const { creation_operation_id: _omitted, ...noOperation } = body
  const refused = await app.inject({ method: 'POST', url: apiRoutes.agent.tasksValidate, headers: authHeader(agent.token), payload: noOperation })
  assert.strictEqual(refused.statusCode, 422)
  assertValid(responseValidator(apiRoutes.agent.tasksValidate, 'post', '422'), refused.json(), `POST ${apiRoutes.agent.tasksValidate} → 422`)
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
  // #111: every header the 201 DECLARES is on the live answer. Derived from the
  // document, so declaring one the server does not send fails here — which is
  // the thing two round-one reviewers said they could not confirm, because the
  // settlement receipt was prose and not a declaration.
  const declaredHeaders = Object.keys(AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasks].post?.responses['201']?.headers ?? {})
  assert.ok(declaredHeaders.length > 0, 'the 201 declares no headers — #111 declared the settlement receipt')
  for (const name of declaredHeaders) {
    assert.ok(created.headers[name] !== undefined, `${name} is declared on the 201 but absent from the live response`)
  }
  // The badge reaches the wire through the documented UserRef: the agent's own draft, then the public feed once open.
  const draft = await app.inject({ method: 'GET', url: gigUrl(quote.json<AgentTaskPaymentRequired>().task_id), headers: authHeader(agent.token) })
  assertValid(responseValidator(documented(GIGS.get)), draft.json(), `GET ${GIGS.get} as the agent`)
  assert.strictEqual(draft.json<GigDetail>().creator.is_agent, true)
})

/**
 * #130 — the bootstrap, proved LIVE.
 *
 * Registration has always told a wallet-owning reader to "POST /v1/auth/nonce,
 * sign the auth message". Neither document defined that operation, so no guard
 * had ever compared its answer, or the message format it describes, to
 * anything. A reviewer with a wallet stopped exactly there on 2026-09-07.
 *
 * Three claims, in the order a reader meets them: the nonce body is the shape
 * the document promises; the message template the document PUBLISHES is the one
 * the shared builder produces (so following the document byte-for-byte produces
 * a message this server parses); and the verify body it declares is one the
 * route accepts, refusing on the SIGNATURE rather than on the shape.
 */
test('#130: the live nonce, the published auth-message template, and the verify body the route accepts', { skip }, async () => {
  const app = getApp()
  await resetDb(app)

  const issued = await app.inject({ method: 'POST', url: apiRoutes.auth.nonce })
  assert.strictEqual(issued.statusCode, 200, issued.body)
  assertValid(responseValidator(apiRoutes.auth.nonce, 'post'), issued.json(), `POST ${apiRoutes.auth.nonce}`)

  // The template is published by rendering `buildAuthMessage` over
  // placeholders, so a real message differs from it only by substitution.
  // Asserted that way round rather than by restating the format here — a copy
  // of the format in this file would be the second implementation the shared
  // builder exists to prevent.
  const { nonce, issued_at } = issued.json<AuthNonceResponse>()
  const address = `0x${'ab'.repeat(20)}`
  const message = buildAuthMessage({
    address,
    chain_id: TEST_CHAIN_ID_ALT,
    uri: 'https://api.example',
    nonce,
    issued_at: new Date(issued_at),
  })
  const asTemplate = message
    .replace(address, '{address}')
    .replace(TEST_CHAIN_ID_ALT, '{chain_id}')
    .replace('https://api.example', '{api_base_url}')
    .replace(nonce, '{nonce}')
    .replace(new Date(issued_at).toISOString(), '{issued_at}')
  assert.ok(
    (operation(apiRoutes.auth.nonce).description ?? '').includes(asTemplate),
    `the published template is not what buildAuthMessage produces:\n--- expected the description to contain ---\n${asTemplate}`,
  )

  // The declared body, for a wallet no account holds. Under the test harness
  // the chain adapter is a FAKE and accepts the signature, so the request runs
  // PAST parsing and past verification and lands on the account lookup: 404
  // WALLET_NOT_LINKED. That is the stronger assertion of the two available
  // here — it proves the route read every field of the declared body, where a
  // wrong schema is refused 400 on a field several steps earlier.
  //
  // This is also how the 404 came to be documented at all: written first
  // expecting the 401 a real adapter gives (observed live, INVALID_SIGNATURE),
  // this case answered 404 and the operation did not declare it.
  const refused = await app.inject({
    method: 'POST',
    url: apiRoutes.auth.verify,
    payload: { method: 'wallet', chain_id: TEST_CHAIN_ID_ALT, address, message, signature: `0x${'11'.repeat(65)}` },
  })
  assert.strictEqual(refused.statusCode, 404, refused.body)
  assert.ok(operation(apiRoutes.auth.verify).responses['404'] !== undefined, 'the 404 must stay declared')
  assertValid(responseValidator(apiRoutes.auth.verify, 'post', '404'), refused.json(), `POST ${apiRoutes.auth.verify} → 404`)
})
