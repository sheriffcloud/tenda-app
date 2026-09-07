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
  CHAIN_MANIFEST,
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
} from '@tenda/shared'
import { AGENT_API_DOCUMENT } from '@server/agent-api/openapi'
import { COMPONENT_REF_PREFIX, agentApiAjv } from '../helpers/agent-api-validator'

const { components } = AGENT_API_DOCUMENT

test('v1 request bodies derive their bounds from the shared constants the routes enforce', () => {
  const task = components.schemas.AgentTaskBody.properties ?? {}
  assert.deepStrictEqual(task.category.enum, GIG_CATEGORIES)
  assert.deepStrictEqual(task.chain_id.enum, CHAIN_MANIFEST.map((entry) => entry.id))
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
