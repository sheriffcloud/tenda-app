/**
 * The Agent API document (v0 reads; the v1 writes are in the sibling
 * agent-api-document-v1.test.ts), as a document: well-formed, internally
 * consistent, and DERIVED from the shared vocabularies rather than restating
 * them. The live half — every path served, every response validating — is
 * test/integration/agent-api-drift.test.ts.
 *
 * The closure property is asserted here because it is the mechanism the
 * drift test relies on: an object schema that admitted unknown keys would
 * let a new wire field through silently.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { Column, is } from 'drizzle-orm'
import {
  AMOUNT_RAW_PATTERN,
  CHAIN_KINDS,
  CHAIN_MANIFEST,
  ESCROW_LIMITS,
  APPLICATION_STATUSES,
  ErrorCode,
  GIG_CATEGORIES,
  GIG_LIST_SORTS,
  LOCATIONS,
  MAX_PAGINATION_LIMIT,
  MAX_PROXIMITY_RADIUS_KM,
  PROOF_TYPES,
  apiRoutes,
  type ChainRegistryEntry,
} from '@tenda/shared'
import { chainNamespaceEnum, escrowStatusEnum } from '@tenda/shared/db/schema'
import {
  AGENT_API_DOCUMENT,
  AGENT_API_DOCUMENT_PATH,
  AGENT_API_STABILITY,
  AGENT_API_VERSION,
  operationsOf,
  PLATFORM_COMPONENT_NAMES,
  type SchemaObject,
} from '@tenda/api-doc'
import { FEATURED_RAIL_LIMIT } from '@server/features/gigs/featured'
import { GIG_SUMMARY_COLS } from '@server/features/gigs/gig-read'
import { COMPONENT_REF_PREFIX, agentApiAjv, strictAjv } from '@tenda/api-doc/testing'

const { paths, components } = AGENT_API_DOCUMENT

/** Every schema object reachable from `root`, including nested ones. */
function walk(root: SchemaObject, visit: (schema: SchemaObject) => void): void {
  visit(root)
  for (const child of Object.values(root.properties ?? {})) walk(child, visit)
  if (root.items !== undefined) walk(root.items, visit)
  for (const child of root.oneOf ?? []) walk(child, visit)
  if (typeof root.additionalProperties === 'object') walk(root.additionalProperties, visit)
}

test('the document names its own path and version, and is OpenAPI 3.1', () => {
  assert.strictEqual(AGENT_API_DOCUMENT.openapi, '3.1.0')
  // The $ref prefix is OpenAPI's, not ours: every internal check would still
  // pass with a misspelt one (the validator registers under the same string),
  // and only an external reader would notice. Pinned to the spec's spelling.
  assert.strictEqual(COMPONENT_REF_PREFIX, '#/components/schemas/')
  assert.strictEqual(AGENT_API_DOCUMENT.info.version, AGENT_API_VERSION)
  assert.strictEqual(AGENT_API_DOCUMENT_PATH, '/v1/openapi.json')
  // The guarantees are the point of a v0: they travel IN the document.
  assert.deepStrictEqual(AGENT_API_DOCUMENT.info['x-tenda-stability'], AGENT_API_STABILITY)
  assert.ok(AGENT_API_STABILITY.some((line) => /anonymous/i.test(line) && /bearer/i.test(line)))
  assert.ok(AGENT_API_STABILITY.some((line) => /never removed/i.test(line)))
  assert.ok(AGENT_API_STABILITY.some((line) => /is_agent/.test(line)))
  // Pinned so a bump is never incidental. 2.0.0 was the first MAJOR: #41 renamed
  // and retyped a REQUEST field on POST /v1/agent/tasks (accept_deadline_unix →
  // accept_window_seconds), which the response-field promise below does not
  // cover and which a caller must act on. 2.1.0 ADDED POST /v1/agent/tasks/validate
  // — a new path, which the "new paths may be added" promise makes a MINOR.
  assert.strictEqual(AGENT_API_VERSION, '2.1.0')
})

test('the public reads are GET-only and every agent write POST-only, all spelled from the route map', () => {
  // Anonymous GETs: the four gig reads, plus the deployment's own chain list.
  // That last one is documented because #126 stopped enumerating chain ids —
  // the document cannot know which chains a deployment settles on, so it points
  // at the endpoint that does, and a pointer to a path this document does not
  // describe would be the same dead end one indirection further out.
  const READS = [
    apiRoutes.gigs.list, apiRoutes.gigs.facets, apiRoutes.gigs.featured, apiRoutes.gigs.get.replace(':id', '{id}'),
    apiRoutes.platform.chains,
  ]
  // Writes that take a body. The demo session is a POST too, but it takes NONE
  // — that is its whole shape (#108) — so it is asserted separately below
  // rather than weakened into this list.
  // `/v1/auth/verify` joins them since #130: it takes the same wallet proof and
  // is how an existing agent signs back in, which registration has always told
  // readers to use.
  const WRITES = [apiRoutes.agent.register, apiRoutes.agent.tasks, apiRoutes.agent.tasksValidate, apiRoutes.auth.verify]
  const BODYLESS = [apiRoutes.agent.demoSession]
  // The nonce (#130) is a POST that takes nothing either, but it is NOT a door:
  // it hands out something to sign, not a bearer, and it has no 503 because a
  // deployment cannot be configured without it. Its own list rather than a
  // weakened BODYLESS — the 503 assertion below is load-bearing for the demo.
  const BOOTSTRAP = [apiRoutes.auth.nonce]
  assert.deepStrictEqual(Object.keys(paths).sort(), [...READS, ...WRITES, ...BODYLESS, ...BOOTSTRAP].sort())
  for (const path of READS) {
    const item = paths[path]
    assert.deepStrictEqual(Object.keys(item), ['get'], `${path} must be read-only`)
    assert.ok(item.get?.responses['200'] !== undefined, `${path} documents its 200`)
    assert.strictEqual(item.get?.security, undefined, `${path} is anonymous`)
  }
  for (const path of WRITES) {
    const item = paths[path]
    assert.deepStrictEqual(Object.keys(item), ['post'], `${path} must be write-only`)
    assert.ok(item.post?.requestBody?.required === true, `${path} documents its body`)
  }
  // The demo session (#108): a POST that takes nothing, needs nothing, and
  // hands back a bearer. Anonymous BY NECESSITY, exactly like registration — it
  // is the door for a caller who cannot sign a wallet proof — and it must keep
  // documenting the 503 a deployment without a demo address answers, or the
  // only honest outcome becomes an undocumented one.
  for (const path of BODYLESS) {
    const item = paths[path]
    assert.deepStrictEqual(Object.keys(item), ['post'], `${path} must be write-only`)
    assert.strictEqual(item.post?.requestBody, undefined, `${path} must take no body`)
    assert.strictEqual(item.post?.security, undefined, `${path} is anonymous — it is how a bearer is obtained`)
    assert.ok(item.post?.responses['200'] !== undefined, `${path} documents its 200`)
    assert.ok(item.post?.responses['503'] !== undefined, `${path} documents the unconfigured deployment`)
  }
  for (const path of BOOTSTRAP) {
    const item = paths[path]
    assert.deepStrictEqual(Object.keys(item), ['post'], `${path} must be write-only`)
    assert.strictEqual(item.post?.requestBody, undefined, `${path} must take no body`)
    assert.strictEqual(item.post?.security, undefined, `${path} is anonymous — it precedes having a bearer`)
    assert.ok(item.post?.responses['200'] !== undefined, `${path} documents its 200`)
  }
  // The one-shot is bearer-scoped and documents BOTH halves of the x402 round trip.
  const tasks = paths[apiRoutes.agent.tasks].post
  assert.deepStrictEqual(tasks?.security, [{ bearer: [] }])
  assert.ok(tasks?.responses['402'] !== undefined && tasks.responses['201'] !== undefined)
  assert.ok(tasks?.parameters?.some((p) => p.in === 'header' && p.name === 'x-payment'))
  // #126 instance 3: the recorded example carries the chain and asset it was
  // CAPTURED on, which is what makes it a recording. The operation has to say
  // so, or a reader takes those values for defaults and posts a chain this
  // deployment does not settle on.
  assert.match(tasks?.description ?? '', /\/v1\/platform\/chains/)
  // Registration is anonymous by necessity — it is how a bearer is obtained.
  assert.strictEqual(paths[apiRoutes.agent.register].post?.security, undefined)
  // Every operation in the document, walked once — three separate nested walks
  // stood here before #126 added a third.
  const operations = Object.values(paths).flatMap(operationsOf)
  // OpenAPI: a requirement may only name a scheme components.securitySchemes declares.
  const declared = new Set(Object.keys(components.securitySchemes))
  for (const op of operations) {
    for (const requirement of op.security ?? []) {
      for (const name of Object.keys(requirement)) assert.ok(declared.has(name), `security scheme ${name} is not declared`)
    }
  }
  // OpenAPI: an operation may only carry tags the document declares. Unchecked
  // until #126 added the first new tag since the document was written, and a
  // typo here is invalid OpenAPI that renders as an unlabelled operation.
  const declaredTags = new Set(AGENT_API_DOCUMENT.tags.map((tag) => tag.name))
  for (const op of operations) {
    for (const tag of op.tags) assert.ok(declaredTags.has(tag), `tag ${tag} on ${op.operationId} is not declared`)
  }
  assert.deepStrictEqual(components.securitySchemes.bearer.type, 'http')
  assert.deepStrictEqual(components.securitySchemes.bearer.scheme, 'bearer')
  for (const op of operations) assert.ok(op.operationId.length > 0)
})

test('every $ref resolves to a component schema, and every component is referenced or is a response', () => {
  const referenced = new Set<string>()
  const collect = (schema: SchemaObject) => {
    if (schema.$ref !== undefined) {
      const name = schema.$ref.replace(COMPONENT_REF_PREFIX, '')
      assert.ok(name in components.schemas, `dangling $ref ${schema.$ref}`)
      referenced.add(name)
    }
  }
  for (const schema of Object.values(components.schemas)) walk(schema, collect)
  for (const item of Object.values(paths)) {
    for (const op of operationsOf(item)) {
      for (const response of Object.values(op.responses)) {
        for (const media of Object.values(response.content ?? {})) walk(media.schema, collect)
      }
      for (const media of Object.values(op.requestBody?.content ?? {})) walk(media.schema, collect)
      for (const parameter of op.parameters ?? []) walk(parameter.schema, collect)
    }
  }
  const unreferenced = Object.keys(components.schemas).filter((name) => !referenced.has(name))
  assert.deepStrictEqual(unreferenced, [], 'a component nothing points at is dead documentation')
})

test('every object schema is CLOSED — the drift test depends on it', () => {
  const open: string[] = []
  for (const [name, schema] of Object.entries(components.schemas)) {
    walk(schema, (node) => {
      if (node.type === 'object' && node.additionalProperties === undefined) open.push(name)
    })
  }
  // Two objects are free-form BY CONTRACT (ApiError.details, a structured
  // proof's `values`) — and both say so with an EXPLICIT additionalProperties,
  // which is why neither appears here: the defect is omission, not openness.
  assert.deepStrictEqual(open, [])
})

test('enumerations are the shared vocabularies, not restated copies', () => {
  const summary = components.schemas.GigSummary.properties ?? {}
  assert.deepStrictEqual(summary.status.enum, escrowStatusEnum.enumValues)
  assert.deepStrictEqual(summary.category.enum, GIG_CATEGORIES)
  assert.deepStrictEqual(summary.proof_requirements.items?.enum, PROOF_TYPES)
  // Nullable enums carry null as a value too (a remote poster may have no country).
  assert.deepStrictEqual(summary.country.enum, [...Object.keys(LOCATIONS), null])
  assert.deepStrictEqual(
    components.schemas.GigApplication.properties?.status.enum,
    APPLICATION_STATUSES,
  )
  assert.deepStrictEqual(components.schemas.ApiError.properties?.code.enum, Object.values(ErrorCode))
  // Chain ids are SHAPE-checked and deliberately NOT enumerated (#126): which
  // chains exist is a manifest fact, which chains a deployment settles on is a
  // configuration fact, and this document is deployment-independent. It used to
  // list every manifest entry, which promised `solana:mainnet` and
  // `eip155:8453` — both `planned`, refused everywhere.
  assert.strictEqual(summary.chain_id.enum, undefined, 'chain_id must not enumerate the manifest')
  assert.ok(summary.chain_id.pattern !== undefined, 'chain_id must still be shape-checked')
  const shape = new RegExp(summary.chain_id.pattern)
  assert.ok(shape.test('eip155:84532') && shape.test('solana:devnet'), 'a real chain id must pass')
  assert.ok(!shape.test('bogus:1') && !shape.test('eip155:'), 'a malformed id must not')
  // Every namespace the shared enum declares is accepted. This cannot see
  // WHERE the pattern's alternation came from — a hardcoded one matching today's
  // two namespaces passes — but it is the assertion that goes red the moment a
  // third namespace is added to the enum and a literal fails to follow it.
  for (const ns of chainNamespaceEnum) assert.ok(summary.chain_id.pattern.includes(ns), `${ns} is missing from the pattern`)
  // CAIP-2's reference half is `[-_a-zA-Z0-9]{1,32}`: no dot, and not empty.
  assert.ok(!shape.test('eip155:1.5'), 'a dot is not a CAIP-2 reference character')
  assert.ok(!shape.test(`eip155:${'x'.repeat(33)}`), 'a reference over 32 characters is not CAIP-2')
  // And the reader is told where the deployment's own list lives.
  assert.match(summary.chain_id.description ?? '', /\/v1\/platform\/chains/)
  // The rail is a carousel with a fixed cap, and the document says so.
  assert.strictEqual(components.schemas.FeaturedGigs.properties?.data.maxItems, FEATURED_RAIL_LIMIT)
  // Facets carry one count per category and per market — the whole vocabulary.
  const facets = components.schemas.GigFacets.properties ?? {}
  assert.deepStrictEqual(Object.keys(facets.category.properties ?? {}), [...GIG_CATEGORIES])
  assert.deepStrictEqual(Object.keys(facets.country.properties ?? {}), Object.keys(LOCATIONS))
})

/**
 * A field's nullability on the wire is a property of the COLUMN it is
 * projected from, so this derives the expectation from the Drizzle schema
 * rather than restating it: `GIG_SUMMARY_COLS` is the same map the query
 * selects with, and `.notNull` is what the migration actually declared.
 *
 * `closedFor<GigSummary>` cannot catch this — it binds which keys exist and
 * which are required, and a nullable schema accepts a non-null value happily,
 * so a document that over-promises null drifts silently in both directions.
 */
/**
 * #126 instance 3. The recorded example legitimately carries the chain and
 * asset it was captured on — that is what makes it a recording rather than a
 * hand-written sample. A DESCRIPTION naming one is a different thing: it reads
 * as an instruction, and on a deployment that settles elsewhere it is a wrong
 * one. The document had two ("The chain\'s gig asset id (USDC), e.g.
 * USDC_BASE", and the chain_id enum before instance 2), which is how a
 * reviewer on a Celo deployment would have been told to post USDC_BASE on
 * Base Sepolia.
 *
 * Derived from the manifest, so a chain or asset added later is covered
 * without touching this. Values are left alone; only prose is scanned.
 */
test('no description hand-writes a chain or asset id — those are per-deployment', () => {
  const forbidden = [
    ...CHAIN_MANIFEST.map((entry) => entry.id),
    ...CHAIN_MANIFEST.flatMap((entry) => entry.assets.map((asset) => asset.id)),
  ]
  assert.ok(forbidden.length > 0, 'the manifest is empty — this would pass vacuously')
  const prose: { where: string; text: string }[] = [
    // The document's OWN description, which since #157 stage 3 carries the
    // integration guide — the longest prose in the file, and the piece most
    // likely to reach for a concrete example. It was outside this scan while
    // it was one sentence.
    { where: 'info.description', text: AGENT_API_DOCUMENT.info.description },
  ]
  for (const [name, schema] of Object.entries(components.schemas)) {
    walk(schema, (node) => {
      if (node.description !== undefined) prose.push({ where: `schema ${name}`, text: node.description })
    })
  }
  for (const [path, item] of Object.entries(paths)) {
    for (const op of operationsOf(item)) {
      prose.push({ where: `${path} description`, text: op.description })
      prose.push({ where: `${path} summary`, text: op.summary })
      for (const parameter of op.parameters ?? []) {
        if (parameter.description !== undefined) prose.push({ where: `${path} ?${parameter.name}`, text: parameter.description })
      }
      for (const [status, response] of Object.entries(op.responses)) {
        prose.push({ where: `${path} ${status}`, text: response.description })
      }
    }
  }
  assert.ok(prose.length > 0, 'no prose collected — the scan below would be vacuous')
  const offences = prose.flatMap(({ where, text }) =>
    forbidden.filter((id) => new RegExp(`\\b${id}\\b`).test(text)).map((id) => `${where} names ${id}`),
  )
  assert.deepStrictEqual(offences, [], 'a per-deployment value is written into prose, where it reads as an instruction')
})

test('the document allows null exactly where the DATABASE does', () => {
  const summary = components.schemas.GigSummary.properties ?? {}
  const allowsNull = (schema: SchemaObject): boolean => {
    if (schema.oneOf !== undefined) return schema.oneOf.some((branch) => branch.type === 'null')
    if (Array.isArray(schema.type)) return schema.type.includes('null')
    return schema.type === 'null'
  }

  const checked: string[] = []
  for (const [field, column] of Object.entries(GIG_SUMMARY_COLS)) {
    // `creator` is a nested projection (USER_COLS), not a column of its own.
    // Drizzle's own guard, so this narrows without a cast.
    if (!is(column, Column)) continue
    const schema = summary[field]
    assert.ok(schema !== undefined, `${field} is selected but absent from the document`)
    assert.strictEqual(
      allowsNull(schema),
      !column.notNull,
      `${field}: document ${allowsNull(schema) ? 'allows' : 'refuses'} null, column is ${column.notNull ? 'NOT NULL' : 'nullable'}`,
    )
    checked.push(field)
  }
  // Both polarities are actually represented, or the loop above proves nothing.
  assert.ok(checked.includes('created_at'), 'created_at was not checked')
  assert.ok(checked.includes('accept_deadline'), 'accept_deadline was not checked')
  assert.strictEqual(
    checked.length,
    Object.keys(GIG_SUMMARY_COLS).length - 1,
    'every selected key but `creator` is a column; a new nested projection needs a case here',
  )
})

test('every query parameter compiles strictly and states the bound the server refuses at', () => {
  const ajv = strictAjv()
  type Parameter = NonNullable<ReturnType<typeof operationsOf>[number]['parameters']>[number]
  const byName = new Map<string, Parameter>()
  for (const item of Object.values(paths)) {
    for (const op of operationsOf(item)) {
      for (const parameter of op.parameters ?? []) {
        // Compiling is the check: strict ajv refuses a contradictory schema.
        ajv.compile(parameter.schema)
        byName.set(parameter.name, parameter)
      }
    }
  }
  const param = (name: string): SchemaObject => {
    const parameter = byName.get(name)
    assert.ok(parameter !== undefined, `${name} is documented`)
    return parameter.schema
  }
  // Proximity: the server 400s a zero radius and anything past the cap.
  const radius = ajv.compile(param('radius_km'))
  assert.strictEqual(radius(0), false)
  assert.strictEqual(radius(0.5), true)
  assert.strictEqual(radius(MAX_PROXIMITY_RADIUS_KM), true)
  assert.strictEqual(radius(MAX_PROXIMITY_RADIUS_KM + 1), false)
  // Page size: the clamp's ceiling, from the constant the clamp reads.
  assert.strictEqual(param('limit').maximum, MAX_PAGINATION_LIMIT)
  // Amount bounds: CANONICAL integers — the server refuses `007`.
  const minAmount = ajv.compile(param('min_amount_raw'))
  assert.strictEqual(minAmount('0'), true)
  assert.strictEqual(minAmount('12'), true)
  assert.strictEqual(minAmount('007'), false)
  assert.strictEqual(minAmount(''), false)
  assert.strictEqual(param('max_amount_raw').pattern, AMOUNT_RAW_PATTERN.source)
  // Vocabularies the server enforces, spelled from the shared constants.
  assert.deepStrictEqual(param('sort').enum, GIG_LIST_SORTS)
  // Same as the response field: shape, not a manifest listing (#126).
  assert.strictEqual(param('chain_id').enum, undefined)
  assert.ok(param('chain_id').pattern !== undefined)
  // A city is matched as sent; nothing checks it against the country.
  assert.doesNotMatch(byName.get('city')?.description ?? '', /belong/)
})

test('a schema requires every property it declares — a listed-but-optional field is a lie', () => {
  // #129 shipped `roles` into ChainRegistryAsset's properties while the
  // hand-written `required` list silently stayed behind (a string replace that
  // did not match), so the document DECLARED the field and did not require it:
  // a response omitting it still validated, and codegen would type it optional
  // against a wire type that always sends it. `required` is now derived with
  // allKeys; this proves the result bites.
  const validate = agentApiAjv().getSchema(`${COMPONENT_REF_PREFIX}ChainRegistryAsset`)
  assert.ok(validate !== undefined)
  const asset: ChainRegistryEntry['assets'][number] = {
    id: 'USDC_CELO', symbol: 'USDC', decimals: 6, is_stable: true,
    token_address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', supports_permit: true,
    funds_by_signature: true,
    roles: ['gig', 'exchange'],
  }
  assert.strictEqual(validate(asset), true, 'a real asset must validate')
  // Drop each documented property in turn: every one must be required. Rebuilt
  // by filtering entries rather than `delete` on a widened copy, so nothing
  // here needs an `unknown`.
  for (const key of Object.keys(asset)) {
    const without = Object.fromEntries(Object.entries(asset).filter(([name]) => name !== key))
    assert.strictEqual(validate(without), false, `${key} is declared but not required`)
  }
  assert.strictEqual(validate({ ...asset, roles: ['nonsense'] }), false, 'roles is a closed vocabulary')

  // The same rule across the WHOLE platform surface, derived from the name list
  // so a schema added later is covered without touching this: none of these
  // wire types has an optional key, so declaring a property and not requiring
  // it is always the bug above, never a choice.
  for (const name of PLATFORM_COMPONENT_NAMES) {
    const schema = components.schemas[name]
    assert.deepStrictEqual(
      [...(schema.required ?? [])].sort(),
      Object.keys(schema.properties ?? {}).sort(),
      `${name} declares a property it does not require`,
    )
  }
})

test('the schemas compile under a STRICT validator and the closure bites', () => {
  const validate = agentApiAjv().getSchema(`${COMPONENT_REF_PREFIX}UserRef`)
  assert.ok(validate !== undefined)
  const user = {
    id: '1c1e6a6e-9b1e-4e3a-8f4b-2b0f7d6b1a11',
    first_name: 'Ada',
    last_name: null,
    avatar_url: null,
    review_score: '4.80',
    is_seeker: false,
    is_agent: false,
    country: 'NG',
  }
  assert.strictEqual(validate(user), true)
  // is_agent is part of the closed contract now: a ref without it is refused.
  const { is_agent: _dropped, ...withoutAgent } = user
  assert.strictEqual(validate(withoutAgent), false)
  // One undocumented key is a failure, not a pass with a warning.
  assert.strictEqual(validate({ ...user, handle: '@ada' }), false)
  // A wrong type on a documented key is too.
  assert.strictEqual(validate({ ...user, review_score: 4.8 }), false)
})

/**
 * THE GUARD THIS DIRECTORY WAS MISSING (#130).
 *
 * Every earlier check asked whether the paths the document DECLARES are
 * correct. None asked whether the paths it TALKS ABOUT exist. So
 * `/v1/agent/register` could instruct a reader to "POST /v1/auth/nonce" for
 * months while no document defined that operation, and every guard stayed
 * green — the sentence is just a string, and nothing compared it to
 * `paths`. A reviewer with a wallet found it on 2026-09-07 by trying to
 * follow it, which is the only way it could have been found.
 *
 * The rule: a `/v1/...` path spoken in prose is a promise the reader can
 * navigate to. Either define it, or do not name it. (It used to run over two
 * documents, each against its own `paths`, because the agent-only subset
 * carried fewer; the subset is retired (#135) and ONE document is served.)
 */
const PROSE_PATH = /\/v1\/[A-Za-z0-9_\-{}/]*[A-Za-z0-9_}](?:\.[A-Za-z0-9]+)?/g

/**
 * Paths a document may NAME without defining, each with the reason it is
 * allowed to. Deliberately tiny and deliberately explicit: an exemption list
 * that grows silently is how the defect this test exists for came back.
 */
const NAMEABLE_WITHOUT_DEFINING: Readonly<Record<string, string>> = {
  // EMPTY, and measured to be: the one entry it carried — the document's own
  // path — was the subset's pointer at "the other document" (#135), and with
  // the subset retired no string in the document names it (0 matches on the
  // serialised document, 2026-09-08). A register entry nothing exercises is
  // the silent growth the sentence above warns about, in the other direction.
  // `/v1/escrows` and `/v1/gigs` were exempt here from the day this guard was
  // written: AgentTaskBody described itself as "POST /v1/escrows minus kind
  // and permit plus POST /v1/gigs minus escrow_id" — an explanation to someone
  // who already knew the human API, and two dead ends to the agent reader the
  // subset is for. The external reviewer listed both. The sentence now says
  // what the fields ARE (#136), and the exemption is gone with it.
}

test('every path named in prose is one the document defines', () => {
  const defined = new Set(Object.keys(paths))
  const dangling = new Map<string, string>()
  // Walk the document as TEXT, so a path named anywhere — an operation
  // description, a schema description, a stability line, a parameter — is
  // caught. Restricting this to descriptions is how a variant of the same
  // defect survives in a place nobody thought to look.
  const walk = (node: unknown, where: string): void => {
    if (typeof node === 'string') {
      // `/v1/agent/*` names a FAMILY of paths, not one of them — the
      // stability guarantees speak about the whole write surface that way.
      // Stripped before matching rather than exempted after, because the
      // exemption list is for real paths a document may name, and a
      // wildcard is not a path a reader could navigate to.
      const prose = node.replace(/\/v1\/[A-Za-z0-9_\-/]*\/\*/g, '')
      for (const named of prose.match(PROSE_PATH) ?? []) {
        if (defined.has(named)) continue
        if (named in NAMEABLE_WITHOUT_DEFINING) continue
        dangling.set(named, where)
      }
      return
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => { walk(item, `${where}[${i}]`) })
      return
    }
    if (typeof node === 'object' && node !== null) {
      for (const [key, value] of Object.entries(node)) walk(value, `${where}.${key}`)
    }
  }
  walk(AGENT_API_DOCUMENT, '$')

  assert.deepStrictEqual(
    [...dangling.entries()],
    [],
    'the document sends a reader to paths it does not define: ' +
      [...dangling].map(([path, where]) => `${path} (at ${where})`).join(', '),
  )
})

test('the bootstrap a wallet-owning agent needs is in the document', () => {
  // The narrow, behavioural half of the guard above: not merely "no dangling
  // reference" — which deleting the sentence would also satisfy — but that the
  // two operations are actually there. A future trim that drops them fails
  // here rather than silently restoring the 2026-09-07 wall.
  for (const path of [apiRoutes.auth.nonce, apiRoutes.auth.verify]) {
    assert.ok(paths[path]?.post !== undefined, `the document lost POST ${path}`)
  }
})

/**
 * #134 — the demo session promises only what a keyless bearer can reach.
 *
 * The description used to say the demo bearer could "see the real 402 terms
 * and the real 201 straight away", then two sentences later that "it cannot
 * fund anything" because the server does not hold the demo key. Both halves
 * were true of the SERVER and contradictory as a promise to the reader: a
 * bearer with no key reaches the 402 and can never reach the 201. An external
 * reviewer read the first half, tried, and filed the second as a defect.
 *
 * The rule, checked as prose because the promise IS prose: every sentence of
 * the demo-session description that mentions the 201 must also say it needs
 * the key. Restoring the old clause puts "201" in a sentence with no "key" and
 * fails here; deleting every mention of the 201 fails too, because the reader
 * must be told where the demo stops, not left to find out.
 */
test('#134: the demo session promises the 402 and the draft, and says the 201 needs a key', () => {
  const demo = AGENT_API_DOCUMENT.paths[apiRoutes.agent.demoSession]?.post
  assert.ok(demo !== undefined, 'the demo session is documented')
  const description = demo.description ?? ''
  const sentences = description.split(/(?<=\.)\s+/)
  const about201 = sentences.filter((sentence) => /\b201\b/.test(sentence))
  assert.ok(about201.length > 0, 'the description must say where the demo stops — the 201 — rather than stay silent about it')
  for (const sentence of about201) {
    assert.match(sentence, /\bkey\b/, `a sentence names the 201 without saying it needs the key: "${sentence}"`)
  }
  // The positive half: what the demo DOES reach is still promised, and the
  // way past the wall is still named.
  assert.match(description, /402 terms/)
  assert.match(description, /cannot fund/)
  assert.ok(description.includes(`POST ${apiRoutes.agent.register}`), 'the reader is sent to registration for a real post')
})

/**
 * #136 — the task body tells the reader what OMISSION means, and what it
 * cannot set at all.
 *
 * The reviewer posted a task with the policy fields left out and learned the
 * defaults from the 402: `requiresApproval: false`, `disputeBond: "0"`,
 * `unassignWindowSeconds: "21600"`. The first two are body fields with no
 * stated default; the third is not a body field at all — it is stamped from
 * platform config — and nothing said so. Each is asserted where the reader
 * meets it, and the one that is NOT a field is asserted to STAY not a field,
 * because the sentence that explains it would become a lie the day it is added.
 */
test('#136: omitted policy fields state their default, and the deployment-set term says where it comes from', () => {
  const body = AGENT_API_DOCUMENT.components.schemas.AgentTaskBody
  const props = body.properties ?? {}
  assert.strictEqual(props.requires_approval?.default, false)
  assert.match(props.requires_approval?.description ?? '', /[Oo]mitted = false/)
  assert.match(props.requires_approval?.description ?? '', /assigned_counterparty_id/, 'the exclusion the validator enforces is stated')
  assert.strictEqual(props.dispute_bond_raw?.default, '0')
  assert.match(props.dispute_bond_raw?.description ?? '', /[Oo]mitted = "0"/)

  // Deployment-set: named in the body's own description as NOT the caller's,
  // sourced to platform config, and absent from the properties — all three,
  // because any one of them alone lets the other two rot.
  assert.match(body.description ?? '', /unassign_window_seconds/)
  assert.match(body.description ?? '', /platform config/)
  assert.ok(!('unassign_window_seconds' in props), 'unassign_window_seconds became a body field — rewrite the sentence that says it is not')
  const signed = AGENT_API_DOCUMENT.components.schemas.EvmCreateParamsWire.properties ?? {}
  assert.match(signed.unassignWindowSeconds?.description ?? '', /platform config/, 'the signed term says where its value came from')
})

/**
 * #136 — a document that promises the public feed must carry it.
 *
 * The subset used to prepend the canonical purpose line verbatim, which opens
 * with "browse the public feed", to a document with no `/v1/gigs`. The subset
 * is gone (#135); the implication stays, because it is what a future trim of
 * the read surface would break: a document may promise the feed only if it
 * defines the path a reader would browse it at.
 */
test('#136: the document promises the feed only if it carries it — and today it does both', () => {
  const promisesFeed = /public feed/.test(AGENT_API_DOCUMENT.info.description)
  const carriesFeed = paths[apiRoutes.gigs.list] !== undefined
  assert.ok(!promisesFeed || carriesFeed, `the document promises the public feed and defines no ${apiRoutes.gigs.list}`)
  // Both halves hold, so the implication is not vacuously true because nobody
  // promises anything any more.
  assert.ok(promisesFeed && carriesFeed)
})

/**
 * #132 — the registry operation and the 503 both name the readiness field.
 *
 * "A chain appears only when this server holds its configuration and can
 * settle on it" was read, reasonably, as "can fund a task on it". The field
 * that answers the real question is `relayed_funding_available`; the operation
 * that lists chains must tell the reader to use it, and the 503 the wrong
 * choice produces must send them back to it — so the recovery is written in
 * both places a reader can be standing when they need it.
 */
test('#132: the chains operation and the one-shot 503 both point at relayed_funding_available', () => {
  const chains = AGENT_API_DOCUMENT.paths[apiRoutes.platform.chains]?.get
  assert.ok(chains !== undefined)
  assert.match(chains.description ?? '', /relayed_funding_available/)
  assert.doesNotMatch(chains.description ?? '', /can settle on it/, 'the sentence the reviewer misread is gone')
  const entry = AGENT_API_DOCUMENT.components.schemas.ChainRegistryEntry
  assert.strictEqual(entry.properties?.relayed_funding_available?.type, 'boolean')
  assert.ok(entry.required?.includes('relayed_funding_available'), 'never optional — an absent field would read as "unknown", which is the guess this exists to remove')
  assert.match(entry.properties?.relayed_funding_available?.description ?? '', /503/)
  const tasks = AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasks]?.post
  assert.match(tasks?.responses['503']?.description ?? '', /relayed_funding_available/)
  assert.match(tasks?.responses['503']?.description ?? '', /names the chains it CAN relay on/)
  // #137: the testnet money question is answered on the entry, nullable
  // because most deployments are mainnets and one testnet has no faucet.
  assert.ok(entry.required?.includes('faucet_url'))
  assert.deepStrictEqual(entry.properties?.faucet_url?.type, ['string', 'null'])
})

/**
 * #138 — the round-two reviewer's four prose defects, each pinned where a
 * reader meets it. (1) The gig read used to say drafts answer 404 identically
 * while the task operation sends the creator there to poll a draft and the
 * route answers them 200. (2) `my_signer_address` said only "null for
 * anonymous readers" — it is the chain-attested signer, null on a draft by
 * design, and the quote's binding address is `payment.creator`. (3) Three body
 * fields stated no omission meaning. (4) "in one call" oversold a 402, a
 * resend and a poll.
 */
test('#138: the gig read names the creator exception, the signer readback says why a draft is null, omissions are stated, and the summary does not oversell', () => {
  const read = AGENT_API_DOCUMENT.paths[apiRoutes.gigs.get.replace(':id', '{id}')]?.get
  assert.ok(read !== undefined)
  assert.doesNotMatch(read.description, /answer 404 identically/)
  assert.match(read.description, /creator reads their own draft/)
  assert.match(read.description, /both parties keep reading a taken-down listing/)

  const signer = AGENT_API_DOCUMENT.components.schemas.GigDetail.properties?.my_signer_address
  assert.match(signer?.description ?? '', /draft answers null/)
  assert.match(signer?.description ?? '', /payment\.creator/)

  const body = AGENT_API_DOCUMENT.components.schemas.AgentTaskBody.properties ?? {}
  for (const field of ['assigned_counterparty_id', 'latitude', 'longitude', 'proof_params'] as const) {
    assert.match(body[field]?.description ?? '', /[Oo]mitted = /, `${field} states what omission means`)
  }

  const tasks = AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasks]?.post
  assert.doesNotMatch(tasks?.summary ?? '', /in one call/)
  assert.match(tasks?.summary ?? '', /402/)
  assert.match(tasks?.summary ?? '', /poll/)

  // Round three (2026-09-07): `remote` decides on-site vs remote and stated no
  // default; `description` stated no omission meaning; ApiError claimed EVERY
  // non-2xx while the 402 is the x402 envelope. (The 422/503 code split is
  // #143, held in relay-error-codes.test.ts.)
  assert.strictEqual(body.remote?.default, false)
  assert.match(body.remote?.description ?? '', /[Oo]mitted = false/)
  assert.match(body.description?.description ?? '', /[Oo]mitted = null/)
  assert.match(AGENT_API_DOCUMENT.components.schemas.ApiError.description ?? '', /except the 402/)
})

/**
 * #139 step 0 — the registry's answer for a testnet with no faucet is a CLAIM
 * ("the token's mint() is open"), so the field says it and the manifest is what
 * makes it true: see manifest.test.ts for the validator half.
 */
test('#139: a null faucet on a testnet is explained as an open mint at the asset token', () => {
  const faucet = AGENT_API_DOCUMENT.components.schemas.ChainRegistryEntry.properties?.faucet_url
  assert.match(faucet?.description ?? '', /mint\(\) is open/)
  assert.match(faucet?.description ?? '', /token_address/)
  // `network_kind` is what makes the two nulls distinguishable, so it is
  // required and spelled from the shared vocabulary rather than restated. Not
  // `kind`: the 402 carries that name twice already with other meanings.
  const entry = AGENT_API_DOCUMENT.components.schemas.ChainRegistryEntry
  assert.ok(entry.required?.includes('network_kind'))
  assert.ok(!('kind' in (entry.properties ?? {})), 'a third `kind` in the document')
  assert.deepStrictEqual(entry.properties?.network_kind?.enum, CHAIN_KINDS)
  assert.match(faucet?.description ?? '', /`network_kind` tells the two nulls apart/)
})

/**
 * #148 — the review window on the entry is the CONTRACT's, and the document
 * states the contract's own range for it rather than a literal: the bounds
 * come from ESCROW_LIMITS, the shared mirror of both contracts' constants
 * (parity-guarded), so the document cannot promise a window a chain would
 * refuse — and a reader sees that 3,600 is the floor, not 1.
 */
test('#148: approval_window_seconds is required and bounded by the contracts\' own range', () => {
  const entry = AGENT_API_DOCUMENT.components.schemas.ChainRegistryEntry
  const window = entry.properties?.approval_window_seconds
  assert.ok(entry.required?.includes('approval_window_seconds'))
  assert.strictEqual(window?.type, 'integer')
  assert.strictEqual(window?.minimum, ESCROW_LIMITS.minApprovalWindowSeconds)
  assert.strictEqual(window?.maximum, ESCROW_LIMITS.maxApprovalWindowSeconds)
  assert.match(window?.description ?? '', /contract/)
  assert.match(window?.description ?? '', /approval_deadline/)
})
