/**
 * The POLL example (#97) — the step the published flow used to stop short of.
 *
 * Split from agent-api-examples.test.ts when that file passed 300 lines, the
 * way config-env-blank.test.ts was split from config-env.test.ts. The subjects
 * are genuinely different: that file owns the task POST's three payloads, this
 * one owns the gig read they end on.
 *
 * Why it exists at all: all ten round-one reviewers named "the response from
 * polling GET /v1/gigs/{task_id}" as missing evidence. The recorder had been
 * fetching it and throwing it away.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from '@tenda/shared'
import {
  AGENT_API_DOCUMENT,
  withRecordedExamples,
  type RecordedExchange,
  RECORDED_EXCHANGE,
  JSON_MEDIA_TYPE,
} from '../src'
import { agentApiAjv } from '../src/testing/agent-api-validator'

const ajv = agentApiAjv()

/** The gig detail's key in the document — OpenAPI's spelling, not Fastify's. */
const GIG_DETAIL_PATH = apiRoutes.gigs.get.replace(':id', '{id}')

/** The media-type object the polled gig documents in the served document. */
function gigContent() {
  const media = AGENT_API_DOCUMENT.paths[GIG_DETAIL_PATH]?.get?.responses['200']?.content?.[JSON_MEDIA_TYPE]
  assert.ok(media !== undefined, 'the document documents no JSON body for the gig detail')
  return media
}


test('the POLL carries an inline recorded example — the third payload every reviewer asked for', () => {
  // Ten of ten named this one: "the response from polling GET /v1/gigs/{task_id}".
  // #109 published the 402 and the 201 and stopped exactly where they said they
  // were left, even though the recorder had already fetched this and thrown it
  // away.
  assert.deepStrictEqual(gigContent().example, JSON.parse(JSON.stringify(RECORDED_EXCHANGE.polled)))
})


test('the polled example validates against the CLOSED GigDetail schema', () => {
  const media = gigContent()
  const validate = ajv.compile(media.schema)
  assert.strictEqual(
    validate(media.example),
    true,
    `the polled example does not satisfy GigDetail:\n${ajv.errorsText(validate.errors, { separator: '\n' })}`,
  )
})


test('the poll is the SAME task the 402 and the 201 named — the flow closes', () => {
  // The reviewers did not ask for a gig; they asked for the END of the flow
  // they recited. An example of some OTHER gig would satisfy the schema and
  // teach nothing, so what is asserted is the identity that makes it the end of
  // THIS exchange.
  assert.strictEqual(RECORDED_EXCHANGE.polled.escrow_id, RECORDED_EXCHANGE.payment_required.task_id)
  assert.strictEqual(RECORDED_EXCHANGE.polled.escrow_id, RECORDED_EXCHANGE.created.task_id)
  // And it agrees with the terms about the money and the chain.
  const offer = RECORDED_EXCHANGE.payment_required.accepts[0]
  assert.ok(offer !== undefined)
  assert.strictEqual(RECORDED_EXCHANGE.polled.amount_raw, offer.amount_raw)
  assert.strictEqual(RECORDED_EXCHANGE.polled.asset, offer.asset_id)
  assert.strictEqual(RECORDED_EXCHANGE.polled.chain_id, offer.network)
  assert.strictEqual(RECORDED_EXCHANGE.polled.title, RECORDED_EXCHANGE.request.title)
})


test('the poll shows the DRAFT the 201 promised, not a published gig', () => {
  // The 201 says "the task is a draft until the chain confirms". If the polled
  // example showed `open`, the document would be promising a reader something
  // the recorded run never reached — and the poll loop the flow describes
  // ("until status is open") would look already finished.
  assert.strictEqual(RECORDED_EXCHANGE.created.status, 'draft')
  assert.strictEqual(RECORDED_EXCHANGE.polled.status, 'draft')
  assert.strictEqual(RECORDED_EXCHANGE.polled.hidden, false)
})


test('the poll is the CREATOR\'s view, and the agent badge reaches the wire', () => {
  // A draft answers nobody else, so this example is only reachable with the
  // bearer — worth pinning, because an anonymous reader gets a 404 here and a
  // reader who mistakes this for the public shape would build the wrong client.
  const polled = RECORDED_EXCHANGE.polled
  assert.strictEqual(polled.creator.is_agent, true, 'humans always see when the other side is software')
  assert.deepStrictEqual(polled.proof_requirements, RECORDED_EXCHANGE.request.proof_requirements)
  // The party-scoped half in its documented empty shape for a fresh draft.
  assert.strictEqual(polled.counterparty, null)
  assert.deepStrictEqual(polled.proofs, [])
  assert.strictEqual(polled.dispute, null)
})


test('losing ONE attachment point does not cost the other', () => {
  // Two paths carry examples now. A document missing the task path must still
  // publish the poll — and must not have a task path invented for it. The
  // reverse is covered by the case above and by the partial-operation case
  // below; this is the pairing that a single early return would have broken.
  const { [apiRoutes.agent.tasks]: _dropped, ...rest } = AGENT_API_DOCUMENT.paths
  const result = withRecordedExamples({ ...AGENT_API_DOCUMENT, paths: rest })
  assert.strictEqual(result.paths[apiRoutes.agent.tasks], undefined, 'a path appeared from nowhere')
  assert.deepStrictEqual(
    result.paths[GIG_DETAIL_PATH]?.get?.responses['200']?.content?.[JSON_MEDIA_TYPE].example,
    JSON.parse(JSON.stringify(RECORDED_EXCHANGE.polled)),
  )
})


test('and the mirror: losing the GIG path does not cost the task examples', () => {
  // The pair of the case above. Written because coverage showed only one side
  // of that ternary was ever taken — so a change that dropped the task
  // attachment while keeping the gig one would have gone unnoticed.
  const { [GIG_DETAIL_PATH]: _dropped, ...rest } = AGENT_API_DOCUMENT.paths
  const result = withRecordedExamples({ ...AGENT_API_DOCUMENT, paths: rest })
  assert.strictEqual(result.paths[GIG_DETAIL_PATH], undefined, 'a path appeared from nowhere')
  assert.deepStrictEqual(
    result.paths[apiRoutes.agent.tasks]?.post?.responses['402']?.content?.[JSON_MEDIA_TYPE].example,
    JSON.parse(JSON.stringify(RECORDED_EXCHANGE.payment_required)),
  )
})

test('a gig path documenting no JSON 200 is left alone rather than given one', () => {
  const base = AGENT_API_DOCUMENT
  const get = base.paths[GIG_DETAIL_PATH]?.get
  assert.ok(get !== undefined)
  const stripped = {
    ...base,
    paths: {
      ...base.paths,
      [GIG_DETAIL_PATH]: { get: { ...get, responses: { ...get.responses, '200': { description: get.responses['200']?.description ?? '' } } } },
    },
  }
  const resulting = withRecordedExamples(stripped).paths[GIG_DETAIL_PATH]?.get
  assert.strictEqual(resulting?.responses['200']?.content, undefined, 'an example was attached to a response with no body')
})

test('a recording MISSING a field refuses by name, instead of dying as "undefined is not valid JSON"', () => {
  // ./recorded-exchange is GENERATED. A stale or hand-edited one can lack a
  // field the type says is there — the compiler cannot see that, which is why
  // the cast below is the honest way to stage it. Before the guard, this failed
  // at module load inside JSON.parse, with a stack that named neither the
  // recording nor the command that fixes it, on a server that then did not boot.
  const stale = { ...RECORDED_EXCHANGE, polled: undefined } as unknown as RecordedExchange
  assert.throws(
    () => withRecordedExamples(AGENT_API_DOCUMENT, stale),
    (err: unknown) =>
      err instanceof Error &&
      /recorded-exchange has no `polled`/.test(err.message) &&
      /pnpm record:x402/.test(err.message),
    'the refusal must name the missing field AND the command that re-records it',
  )
})

test('the recording is really a PARAMETER — a substituted one is what gets published', () => {
  // Guards the seam itself: if the argument were ignored and the module
  // constant read directly, the case above would pass for the wrong reason
  // (the real recording is complete, so nothing would ever throw).
  const substituted = {
    ...RECORDED_EXCHANGE,
    polled: { ...RECORDED_EXCHANGE.polled, title: 'a substituted title' },
  }
  const doc = withRecordedExamples(AGENT_API_DOCUMENT, substituted)
  const example = doc.paths[GIG_DETAIL_PATH]?.get?.responses['200']?.content?.[JSON_MEDIA_TYPE].example
  assert.deepStrictEqual(example, JSON.parse(JSON.stringify(substituted.polled)))
  assert.notDeepStrictEqual(example, JSON.parse(JSON.stringify(RECORDED_EXCHANGE.polled)))
})
