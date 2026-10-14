/**
 * The Agent API document's V1 half — the write surface (#19): the request
 * bodies and the x402 envelope, checked as a document. Split from
 * `agent-api-document.test.ts` (which owns the v0 read surface and the
 * document-level properties both halves rely on) at that file's own section
 * boundary, to stay inside the 300-line rule.
 *
 * The live half — every path served, 402 and 201 validating — is
 * test/integration/agent-api-drift.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  AMOUNT_RAW_PATTERN,
  GIG_CATEGORIES,
  LOCATIONS,
  MAX_ACCEPT_WINDOW_SECONDS,
  MAX_COMPLETION_DURATION_SECONDS,
  MAX_GIG_TITLE_LENGTH,
  MIN_ACCEPT_WINDOW_SECONDS,
  MIN_COMPLETION_DURATION_SECONDS,
  NAME_MAX_LENGTH,
  PROOF_TYPES,
  RELAY_PAYMENT_KINDS,
  TENDA_RELAY_SCHEME,
  X402_VERSION,
  X_PAYMENT_RESPONSE_HEADER,
  apiRoutes,
} from '@tenda/shared'
import { AGENT_API_DOCUMENT } from '../src'
import { COMPONENT_REF_PREFIX, agentApiAjv } from '../src/testing/agent-api-validator'
import { plainProse } from '../src/testing/document-prose'

const { components } = AGENT_API_DOCUMENT

test('v1 request bodies derive their bounds from the shared constants the routes enforce', () => {
  const task = components.schemas.AgentTaskBody.properties ?? {}
  assert.deepStrictEqual(task.category.enum, GIG_CATEGORIES)
  // The REQUEST side of #126, and the side that mattered most: this enum used to
  // list every manifest entry, so it told an agent it could post `eip155:8453`
  // and `solana:mainnet` — both `status: 'planned'`, refused by every
  // deployment there is. Which chains a deployment settles on comes from its
  // `CHAIN_<id>_*` secrets and is answered by GET /v1/platform/chains; a
  // module-load constant cannot know it, so it now checks shape and says where
  // the real list lives.
  assert.strictEqual(task.chain_id.enum, undefined, 'the request must not enumerate chains this deployment may not serve')
  const chainShape = task.chain_id.pattern
  assert.ok(chainShape !== undefined, 'the request must still SHAPE-check the chain id')
  assert.ok(new RegExp(chainShape).test('eip155:84532'), 'a real chain id must pass')
  assert.ok(!new RegExp(chainShape).test('84532'), 'a bare numeric id must not')
  assert.deepStrictEqual(task.proof_requirements.items?.enum, PROOF_TYPES)
  assert.strictEqual(task.completion_duration_seconds.minimum, MIN_COMPLETION_DURATION_SECONDS)
  assert.strictEqual(task.completion_duration_seconds.maximum, MAX_COMPLETION_DURATION_SECONDS)
  // #41: the accept window is bounded too, and the document must quote the same
  // rail the validator refuses at — a document that promised a wider range than
  // the server accepts would send agents into a 422 they could not predict.
  assert.strictEqual(task.accept_window_seconds.minimum, MIN_ACCEPT_WINDOW_SECONDS)
  assert.strictEqual(task.accept_window_seconds.maximum, MAX_ACCEPT_WINDOW_SECONDS)
  assert.strictEqual(task.title.maxLength, MAX_GIG_TITLE_LENGTH)
  assert.strictEqual(task.amount_raw.pattern, AMOUNT_RAW_PATTERN.source)
  assert.deepStrictEqual(components.schemas.AgentTaskBody.required, [
    'creation_operation_id', 'chain_id', 'asset', 'amount_raw', 'accept_window_seconds', 'completion_duration_seconds', 'title', 'category',
  ])
  const register = components.schemas.AgentRegisterBody.properties ?? {}
  assert.strictEqual(register.name.maxLength, NAME_MAX_LENGTH)
  assert.deepStrictEqual(register.country.enum, Object.keys(LOCATIONS))
  // The 402 is the x402 envelope: version pinned, one accepts entry, the task id beside it.
  const paymentRequired = components.schemas.AgentTaskPaymentRequired.properties ?? {}
  assert.strictEqual(paymentRequired.x402Version.const, X402_VERSION)
  assert.strictEqual(paymentRequired.accepts.maxItems, 1)
  assert.strictEqual(components.schemas.RelayTerms.properties?.scheme.const, TENDA_RELAY_SCHEME)
  assert.deepStrictEqual(
    [components.schemas.EvmAuthorizationTerms, components.schemas.SolanaTransactionTerms].map((s) => s.properties?.kind.const),
    [...RELAY_PAYMENT_KINDS],
  )
})

test('the 201 DECLARES the settlement receipt header, not only prose (#111)', () => {
  // Two round-one reviewers could not confirm the receipt comes back, because
  // the header was described in the operation text and declared nowhere — so
  // nothing generated from this document knew to look for it.
  const created = AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasks].post?.responses['201']
  const header = created?.headers?.[X_PAYMENT_RESPONSE_HEADER]
  assert.ok(header !== undefined, `the 201 does not declare ${X_PAYMENT_RESPONSE_HEADER}`)
  assert.strictEqual(header.schema.type, 'string', 'the header travels base64, so a string')
  assert.ok(header.description.length > 0, 'a declared header with no description says nothing')
})

test('the v1 schemas compile strictly and the closure bites on the task body and the terms', () => {
  const ajv = agentApiAjv()
  const body = ajv.getSchema(`${COMPONENT_REF_PREFIX}AgentTaskBody`)
  assert.ok(body !== undefined)
  const minimal = {
    creation_operation_id: '1c1e6a6e-9b1e-4e3a-8f4b-2b0f7d6b1a11', chain_id: 'eip155:84532', asset: 'USDC_BASE', amount_raw: '25000000',
    accept_window_seconds: MIN_ACCEPT_WINDOW_SECONDS, completion_duration_seconds: MIN_COMPLETION_DURATION_SECONDS, title: 'Deliver a parcel', category: GIG_CATEGORIES[0],
  }
  assert.strictEqual(body(minimal), true)
  assert.strictEqual(body({ ...minimal, permit: {} }), false, 'a permit has no place in the one-shot')
  assert.strictEqual(body({ ...minimal, amount_raw: '007' }), false, 'amounts are canonical')
  // The document refuses the same out-of-rail window the validator does, so an
  // agent generating requests FROM the schema cannot produce a body the server
  // will 422 (#41). Milliseconds-for-seconds is the shape #40 named.
  assert.strictEqual(body({ ...minimal, accept_window_seconds: MAX_ACCEPT_WINDOW_SECONDS + 1 }), false)
  assert.strictEqual(body({ ...minimal, accept_window_seconds: MIN_ACCEPT_WINDOW_SECONDS - 1 }), false)
  assert.strictEqual(body({ ...minimal, accept_window_seconds: Date.now() }), false, 'milliseconds are not seconds')
  const terms = ajv.getSchema(`${COMPONENT_REF_PREFIX}RelayTerms`)
  assert.ok(terms !== undefined)
  assert.strictEqual(terms({ scheme: 'exact' }), false)
})

test('POST /v1/agent/tasks/validate is documented as a bearer-scoped, body-taking check with a closed 200 that cannot be read as "cleared"', () => {
  const op = AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasksValidate]?.post
  assert.ok(op !== undefined, 'the validate-only operation is in the document')
  assert.deepStrictEqual(op.security, [{ bearer: [] }])
  assert.strictEqual(op.requestBody?.required, true)
  // The same body as the one-shot: a divergent schema would be a second contract.
  const bodyRef = (path: string) => JSON.stringify(AGENT_API_DOCUMENT.paths[path]?.post?.requestBody)
  assert.strictEqual(bodyRef(apiRoutes.agent.tasksValidate), bodyRef(apiRoutes.agent.tasks))
  for (const status of ['200', '400', '401', '403', '422', '429'] as const) assert.ok(op.responses[status] !== undefined, `documents ${status}`)
  // `moderation` is a CONSTANT in the schema, not a free string: "ok" can never be read as cleared.
  const ok = components.schemas.AgentTaskValidated
  assert.strictEqual(ok.properties?.moderation?.const, 'not_run')
  assert.strictEqual(ok.properties?.ok?.const, true)
  assert.match(op.description ?? '', /not cleared|does NOT run moderation/i)
  const validate = agentApiAjv().getSchema(`${COMPONENT_REF_PREFIX}AgentTaskValidated`)
  assert.ok(validate !== undefined)
  assert.strictEqual(validate({ ok: true, moderation: 'not_run' }), true)
  assert.strictEqual(validate({ ok: true, moderation: 'passed' }), false, 'a claim of passed moderation is refused')
  assert.strictEqual(validate({ ok: true, moderation: 'not_run', extra: 1 }), false, 'closed')
})

test('the validate operation states what an agent relies on: it writes nothing, skips moderation, and ok is not cleared', () => {
  const description = plainProse(AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasksValidate]?.post?.description ?? '')
  assert.ok(description.length > 0, 'the validate operation has no description')
  // Full phrases, not fragments: each is a promise a client builds on.
  assert.ok(description.includes('it writes nothing'), 'the document no longer says validate writes nothing')
  assert.ok(description.includes('it does not run moderation'), 'the document no longer says moderation is skipped')
  assert.ok(description.includes('ok is not cleared'), 'the document no longer warns that ok is not cleared')
  assert.ok(description.includes('moderation: "not_run"'), 'the document no longer names the not_run answer')
})
