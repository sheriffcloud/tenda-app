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
  APPLICATION_STATUSES,
  CHAIN_MANIFEST,
  ErrorCode,
  GIG_CATEGORIES,
  GIG_LIST_SORTS,
  LOCATIONS,
  MAX_PAGINATION_LIMIT,
  MAX_PROXIMITY_RADIUS_KM,
  PROOF_TYPES,
  apiRoutes,
} from '@tenda/shared'
import { escrowStatusEnum } from '@tenda/shared/db/schema'
import {
  AGENT_API_DOCUMENT,
  AGENT_API_DOCUMENT_PATH,
  AGENT_API_STABILITY,
  AGENT_API_VERSION,
} from '@server/agent-api/openapi'
import { operationsOf } from '@server/agent-api/paths'
import type { SchemaObject } from '@server/agent-api/schema-types'
import { FEATURED_RAIL_LIMIT } from '@server/lib/featured'
import { GIG_SUMMARY_COLS } from '@server/lib/gig-read'
import { COMPONENT_REF_PREFIX, agentApiAjv, strictAjv } from '../helpers/agent-api-validator'

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
  // Pinned so a bump is never incidental. 2.0.0 is the first MAJOR: #41 renamed
  // and retyped a REQUEST field on POST /v1/agent/tasks (accept_deadline_unix →
  // accept_window_seconds), which the response-field promise below does not
  // cover and which a caller must act on.
  assert.strictEqual(AGENT_API_VERSION, '2.0.0')
})

test('the four public gig reads are GET-only and the two agent writes POST-only, all spelled from the route map', () => {
  const READS = [apiRoutes.gigs.list, apiRoutes.gigs.facets, apiRoutes.gigs.featured, apiRoutes.gigs.get.replace(':id', '{id}')]
  const WRITES = [apiRoutes.agent.register, apiRoutes.agent.tasks]
  assert.deepStrictEqual(Object.keys(paths).sort(), [...READS, ...WRITES].sort())
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
  // The one-shot is bearer-scoped and documents BOTH halves of the x402 round trip.
  const tasks = paths[apiRoutes.agent.tasks].post
  assert.deepStrictEqual(tasks?.security, [{ bearer: [] }])
  assert.ok(tasks?.responses['402'] !== undefined && tasks.responses['201'] !== undefined)
  assert.ok(tasks?.parameters?.some((p) => p.in === 'header' && p.name === 'x-payment'))
  // Registration is anonymous by necessity — it is how a bearer is obtained.
  assert.strictEqual(paths[apiRoutes.agent.register].post?.security, undefined)
  // OpenAPI: a requirement may only name a scheme components.securitySchemes declares.
  const declared = new Set(Object.keys(components.securitySchemes))
  for (const item of Object.values(paths)) {
    for (const op of operationsOf(item)) {
      for (const requirement of op.security ?? []) {
        for (const name of Object.keys(requirement)) assert.ok(declared.has(name), `security scheme ${name} is not declared`)
      }
    }
  }
  assert.deepStrictEqual(components.securitySchemes.bearer.type, 'http')
  assert.deepStrictEqual(components.securitySchemes.bearer.scheme, 'bearer')
  for (const item of Object.values(paths)) {
    for (const op of operationsOf(item)) assert.ok(op.operationId.length > 0)
  }
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
  // Chain ids are the manifest's, not a hand-written CAIP-2 regex.
  assert.deepStrictEqual(summary.chain_id.enum, CHAIN_MANIFEST.map((entry) => entry.id))
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
  assert.deepStrictEqual(param('chain_id').enum, CHAIN_MANIFEST.map((entry) => entry.id))
  // A city is matched as sent; nothing checks it against the country.
  assert.doesNotMatch(byName.get('city')?.description ?? '', /belong/)
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
