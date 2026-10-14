/**
 * The published examples (#109): are they there, are they INLINE, and are they
 * still true?
 *
 * The recording's freshness is the anvil recorder's job — it re-drives the
 * exchange and compares. This suite owns everything that can be checked about
 * the STATIC artefact, and it runs with no node and no database, so the
 * properties a reader depends on are never gated behind a toolchain:
 *
 *   - each example validates against the very schema it sits beside, using the
 *     same strict ajv the drift suite holds live responses to;
 *   - the typed data is signable rather than the fake relay's hollow shell;
 *   - nothing is published by `$ref`, which a truncated reader could not follow.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X_PAYMENT_HEADER, apiRoutes } from '@tenda/shared'
import {
  AGENT_API_DOCUMENT,
  recordedPaymentHeader,
  withRecordedExamples,
  RECORDED_EXCHANGE,
  JSON_MEDIA_TYPE,
} from '../src'

/** The gig detail's key in the document — OpenAPI's spelling, not Fastify's. */
const GIG_DETAIL_PATH = apiRoutes.gigs.get.replace(':id', '{id}')
import { agentApiAjv } from '../src/testing/agent-api-validator'

const ajv = agentApiAjv()
const tasks = AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasks]?.post

/** The media-type object a status documents in the served document. */
function content(status: '402' | '201') {
  const media = tasks?.responses[status]?.content?.[JSON_MEDIA_TYPE]
  assert.ok(media !== undefined, `the document documents no JSON body for ${status}`)
  return media
}

test('the 402 and 201 both carry an inline recorded example', () => {
  // The complaint being answered: ten of ten reviewers said they never saw a
  // payload. Presence is the whole point, so it is asserted before anything
  // clever about it.
  assert.deepStrictEqual(content('402').example, JSON.parse(JSON.stringify(RECORDED_EXCHANGE.payment_required)))
  assert.deepStrictEqual(content('201').example, JSON.parse(JSON.stringify(RECORDED_EXCHANGE.created)))
})

test('the request body that produced them is published too', () => {
  // A 402 example without the request that earned it is half a recording: the
  // reader cannot tell which fields drove which terms.
  const media = tasks?.requestBody?.content[JSON_MEDIA_TYPE]
  assert.deepStrictEqual(media?.example, JSON.parse(JSON.stringify(RECORDED_EXCHANGE.request)))
})

test('the X-PAYMENT header carries the base64 an agent actually sends, and it decodes to the recorded envelope', () => {
  const parameter = tasks?.parameters?.find((p) => p.name === X_PAYMENT_HEADER)
  assert.ok(parameter !== undefined, 'the task operation no longer documents the X-PAYMENT header')
  assert.strictEqual(typeof parameter.example, 'string')
  // Published as the header's real wire form — base64 — because that is what a
  // caller has to produce. Decoded here so the assertion is about the CONTENT,
  // not about a string nobody can read.
  const decoded = JSON.parse(Buffer.from(String(parameter.example), 'base64').toString('utf8'))
  assert.deepStrictEqual(decoded, JSON.parse(JSON.stringify(RECORDED_EXCHANGE.payment_envelope)))
  assert.strictEqual(parameter.example, recordedPaymentHeader())
})

test('every published example validates against the CLOSED schema it sits beside', () => {
  // The guard that makes an example a contract rather than a picture. The
  // schemas are closed (additionalProperties: false), so a field the recording
  // carries and the schema does not know about fails here — which is how a
  // stale recording is caught even with no node available to re-drive it.
  for (const status of ['402', '201'] as const) {
    const media = content(status)
    const validate = ajv.compile(media.schema)
    assert.strictEqual(
      validate(media.example),
      true,
      `the ${status} example does not satisfy its own schema:\n${ajv.errorsText(validate.errors, { separator: '\n' })}`,
    )
  }
  const request = tasks?.requestBody?.content[JSON_MEDIA_TYPE]
  assert.ok(request !== undefined)
  const validateRequest = ajv.compile(request.schema)
  assert.strictEqual(
    validateRequest(request.example),
    true,
    `the request example does not satisfy AgentTaskBody:\n${ajv.errorsText(validateRequest.errors, { separator: '\n' })}`,
  )
})

test('the 402 schema refuses an EMPTY accepts — there would be nothing to sign', () => {
  // The route sends `accepts: [outcome.terms]`, always exactly one, and every
  // agent reads accepts[0]. A schema that permitted zero would let a regression
  // emptying the list pass the live-response drift guard, and would tell a
  // reader to write a branch the server never takes.
  const media = content('402')
  const validate = ajv.compile(media.schema)
  assert.strictEqual(validate(JSON.parse(JSON.stringify(RECORDED_EXCHANGE.payment_required))), true)
  assert.strictEqual(
    validate({ ...JSON.parse(JSON.stringify(RECORDED_EXCHANGE.payment_required)), accepts: [] }),
    false,
    'an empty accepts must not validate against the documented 402',
  )
})

test('the recorded terms are SIGNABLE — not the fake relay\'s hollow typed data', () => {
  // The reason the recorder runs against a real node at all. The harness's fake
  // relay answers a quote with `types: { EIP712Domain: [], ReceiveWithAuthorization: [] }`
  // and a zero nonce; publishing that would hand an agent something it cannot
  // sign, while looking entirely plausible. This is the assertion that would
  // have caught it, and it runs everywhere — including where anvil is absent.
  const payment = RECORDED_EXCHANGE.payment_required.accepts[0]?.payment
  assert.ok(payment?.kind === 'eip155-authorization', 'the recording is not EVM authorization terms')
  const { types, domain, message } = payment.typed_data
  assert.ok(types.ReceiveWithAuthorization.length > 0, 'empty ReceiveWithAuthorization — this is the fake relay')
  assert.ok(types.EIP712Domain.length > 0, 'empty EIP712Domain — this is the fake relay')
  assert.notStrictEqual(message.nonce, `0x${'0'.repeat(64)}`, 'a zero nonce — this is the fake relay')
  // The domain has to be the token's own, or a signature over it verifies
  // nowhere: the verifying contract is the asset being moved, not the escrow.
  assert.strictEqual(domain.verifyingContract.toLowerCase(), RECORDED_EXCHANGE.payment_required.accepts[0]?.asset.toLowerCase())
})

test('the envelope pays for the terms it was signed against', () => {
  // A recording where these disagree would document a resend the server
  // refuses — the reader would follow it exactly and get a 422.
  const offer = RECORDED_EXCHANGE.payment_required.accepts[0]
  assert.ok(offer?.payment.kind === 'eip155-authorization')
  const authorization = 'authorization' in RECORDED_EXCHANGE.payment_envelope.payload
    ? RECORDED_EXCHANGE.payment_envelope.payload.authorization
    : undefined
  assert.ok(authorization !== undefined, 'the recorded envelope carries no EVM authorization')
  assert.deepStrictEqual(authorization, offer.payment.typed_data.message)
  assert.strictEqual(RECORDED_EXCHANGE.payment_envelope.network, offer.network)
  assert.strictEqual(authorization.value, offer.amount_raw)
  assert.strictEqual(RECORDED_EXCHANGE.request.amount_raw, offer.amount_raw)
})

test('the settlement header names the same transaction, chain and payer the rest of the exchange did', () => {
  const offer = RECORDED_EXCHANGE.payment_required.accepts[0]
  assert.ok(offer?.payment.kind === 'eip155-authorization')
  assert.strictEqual(RECORDED_EXCHANGE.settlement.transaction, RECORDED_EXCHANGE.created.tx_ref)
  assert.strictEqual(RECORDED_EXCHANGE.created.task_id, RECORDED_EXCHANGE.payment_required.task_id)
  assert.strictEqual(RECORDED_EXCHANGE.settlement.success, true)
  // The settlement header is built from the ESCROW's chain and the resolved
  // creator; the terms come from the ADAPTER. In production those are one chain
  // and one payer, so a recording where they disagree was captured through a
  // misconfigured registry and would document a payment on the wrong network.
  assert.strictEqual(RECORDED_EXCHANGE.settlement.network, offer.network)
  assert.strictEqual(RECORDED_EXCHANGE.settlement.payer, offer.payment.typed_data.message.from)
})

test('the 201 example publishes enqueued:false, so the field has to explain itself', () => {
  // The recording is captured with no Redis (test/helpers/test-app/env.ts
  // deletes REDIS_URL), so the ONE published 201 carries the degraded value of
  // a field a reader has never seen before. Bare, `enqueued: false` reads as
  // "verification did not happen"; with the description it reads as "confirmed
  // by the sweep instead, poll the same way". The example is what makes that
  // description load-bearing, which is why it is guarded beside the example
  // rather than left to whoever next edits the schema.
  assert.strictEqual(RECORDED_EXCHANGE.created.enqueued, false, 'a recording with a live queue would need this comment revisited')
  const enqueued = AGENT_API_DOCUMENT.components.schemas.AgentTaskCreated.properties?.enqueued
  assert.ok(
    enqueued !== undefined && (enqueued.description ?? '').length > 0,
    'AgentTaskCreated.enqueued must document what false means — the published example shows false',
  )
})

test('nothing is published by $ref — a truncated reader meets the payload where the endpoint is', () => {
  // #109's one placement rule. A `$ref`d example sits in a tail the reader who
  // needs it most may never reach, which is the failure this whole document
  // exists to route around.
  const serialised = JSON.stringify(AGENT_API_DOCUMENT)
  assert.strictEqual(serialised.includes('"examples"'), false, 'OpenAPI `examples` (the $ref-able form) crept in')
  const inlineCount = [...serialised.matchAll(/"example":/g)].length
  assert.strictEqual(inlineCount, 7, 'expected the request, 402, 201, X-PAYMENT and the POLLED gig, plus the validate request and its 200')
})

/*
 * The DEGRADATION cases. `AGENT_API_DOCUMENT` is built at module load, so a
 * throw in the attacher is not a failed example — it is a server that does not
 * boot, and it would take out every route rather than one document. Each of
 * these feeds it a document missing the piece an example would attach to and
 * asserts it returns something serviceable instead.
 *
 * Each starts from the SERVED document, which already carries its examples:
 * the attacher is idempotent on `example`, so stripping a piece and
 * re-attaching measures exactly the degradation the case names.
 */

test('a document with NEITHER attachment point is returned untouched, not thrown at', () => {
  const { [apiRoutes.agent.tasks]: _task, [apiRoutes.agent.tasksValidate]: _validate, [GIG_DETAIL_PATH]: _gig, ...rest } = AGENT_API_DOCUMENT.paths
  const without = { ...AGENT_API_DOCUMENT, paths: rest }
  assert.strictEqual(withRecordedExamples(without), without, 'it should hand back the very same object')
})

test('a task operation with no parameters, body or documented 402 still yields a valid document', () => {
  const base = AGENT_API_DOCUMENT
  const post = base.paths[apiRoutes.agent.tasks]?.post
  assert.ok(post !== undefined)
  const { parameters: _p, requestBody: _b, ...bare } = post
  const { '402': _dropped402, ...responses } = post.responses
  const stripped = {
    ...base,
    paths: { ...base.paths, [apiRoutes.agent.tasks]: { post: { ...bare, responses } } },
  }
  const result = withRecordedExamples(stripped)
  const resulting = result.paths[apiRoutes.agent.tasks]?.post
  // Nothing invented: no parameters or body appear from nowhere, no 402 comes
  // back, and the 201 that IS documented still gets its recorded example.
  assert.strictEqual(resulting?.parameters, undefined)
  assert.strictEqual(resulting?.requestBody, undefined)
  assert.strictEqual(resulting?.responses['402'], undefined)
  assert.deepStrictEqual(
    resulting?.responses['201']?.content?.[JSON_MEDIA_TYPE].example,
    JSON.parse(JSON.stringify(RECORDED_EXCHANGE.created)),
  )
})

test('a documented response with no JSON body is left alone rather than given one', () => {
  const base = AGENT_API_DOCUMENT
  const post = base.paths[apiRoutes.agent.tasks]?.post
  assert.ok(post !== undefined)
  const stripped = {
    ...base,
    paths: {
      ...base.paths,
      [apiRoutes.agent.tasks]: {
        post: { ...post, responses: { ...post.responses, '201': { description: post.responses['201']?.description ?? '' } } },
      },
    },
  }
  const resulting = withRecordedExamples(stripped).paths[apiRoutes.agent.tasks]?.post
  assert.strictEqual(resulting?.responses['201']?.content, undefined, 'an example was attached to a response that documents no body')
  assert.strictEqual(resulting?.responses['201']?.description, post.responses['201']?.description)
})

test('a parameter that is not X-PAYMENT is carried through untouched', () => {
  // The attacher stamps ONE header. Anything else the operation documents must
  // come out the far side identical — an example on the wrong parameter is a
  // wrong instruction, not a harmless extra.
  const base = AGENT_API_DOCUMENT
  const post = base.paths[apiRoutes.agent.tasks]?.post
  assert.ok(post?.parameters !== undefined)
  const other = { name: 'x-request-id', in: 'header', required: false, schema: { type: 'string' } } as const
  const widened = {
    ...base,
    paths: { ...base.paths, [apiRoutes.agent.tasks]: { post: { ...post, parameters: [...post.parameters, other] } } },
  }
  const resulting = withRecordedExamples(widened).paths[apiRoutes.agent.tasks]?.post?.parameters
  assert.strictEqual(resulting?.find((p) => p.name === 'x-request-id'), other, 'the untouched parameter should be the same object')
  assert.strictEqual(resulting?.find((p) => p.name === X_PAYMENT_HEADER)?.example, recordedPaymentHeader())
})

test('the validate-only operation carries the recorded request and its one possible 200, both valid against their closed schemas', () => {
  const validate = AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasksValidate]?.post
  const request = validate?.requestBody?.content[JSON_MEDIA_TYPE]?.example
  assert.deepStrictEqual(request, JSON.parse(JSON.stringify(RECORDED_EXCHANGE.request)), 'the same recorded body the one-shot shows')
  const answer = validate?.responses['200']?.content?.[JSON_MEDIA_TYPE]?.example
  assert.deepStrictEqual(answer, { ok: true, moderation: 'not_run' })
  const check = (name: string, value: unknown) => {
    const fn = ajv.getSchema(`#/components/schemas/${name}`)
    assert.ok(fn !== undefined, `${name} is registered`)
    assert.strictEqual(fn(value), true, `${name}: ${JSON.stringify(fn.errors)}`)
  }
  check('AgentTaskBody', request)
  check('AgentTaskValidated', answer)
})
