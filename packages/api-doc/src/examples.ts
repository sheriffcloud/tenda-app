/**
 * RECORDED examples, attached inline to the Agent API document (#109).
 *
 * WHY THEY EXIST. Ten reviewers read this contract on 2026-09-05 and all ten
 * reported the same thing: they never called the endpoint, and the document
 * showed them no payload to reason about. It contained zero `example` keys —
 * measured, not estimated. That was the single most-repeated complaint in the
 * round, ahead of length.
 *
 * WHY THEY ARE RECORDED AND NOT WRITTEN. A hand-written sample is a second
 * implementation of the wire, and it begins drifting from the first the day it
 * is committed — which is the failure this whole document exists to avoid. The
 * values in ./recorded-exchange came out of one real exchange driven through
 * the real route against a real node, and
 * test/integration/agent-x402-recording.anvil.test.ts re-drives that exchange
 * on every run and fails when the shape no longer matches. The examples cannot
 * quietly rot; they can only fail loudly.
 *
 * WHY INLINE AND NEVER `$ref`. A reader whose fetch stops early must meet the
 * payload beside the endpoint, not in a tail it never reaches. They used to go
 * only in the agent-only subset, the canonical document being kept for humans
 * and codegen; the subset is retired (#135, 2026-09-08) and the one document
 * carries them.
 *
 * WHAT THE VALUES ARE. A real EIP-3009 authorization over a real ERC-20's own
 * domain separator, a nonce the escrow contract itself computed, and a
 * transaction the relayer really broadcast — captured on a local node that
 * presents itself as eip155:16602 (0G Galileo, the harness's second chain).
 *
 * TWO OF THE PUBLISHED VALUES ARE THE HARNESS'S, and they are named here rather
 * than left for a reader to trip over. The ADDRESSES are that node's, so they
 * are not 0G Galileo contracts anyone can look up. And `created.enqueued` is
 * FALSE, which is the degraded answer, not the normal one: the recorder runs
 * with no Redis (test/helpers/test-app/env.ts deletes REDIS_URL), so the
 * verify-tx enqueue throws and `recordTxAttempt` reports it — a deployment with
 * a queue answers true. Either way the attempt is durably recorded and the task
 * is verified, which is what the field's own description in the document now
 * says. Everything else — every shape, and every value the server derived
 * rather than the harness chose — is what production sends.
 */
import type { AgentTaskBody, AgentTaskCreated, AgentTaskPaymentRequired, AgentTaskValidated, GigDetail, RelayPaymentPayload, RelaySettlementResponse } from '@tenda/shared'
import { X_PAYMENT_HEADER, apiRoutes } from '@tenda/shared'
import { JSON_MEDIA_TYPE, type ExampleValue, type HttpStatus, type JsonContent, type OperationObject, type ResponseObject } from './paths'
import { RECORDED_EXCHANGE } from './recorded-exchange'
import type { OpenApiDocument } from './openapi'

/**
 * One captured one-shot, in the order it happened. Typed against the SHARED
 * wire types on purpose: the recording is checked by the compiler as well as
 * by its suite, so a renamed or removed field cannot be published — the build
 * breaks before anything is served.
 */
export interface RecordedExchange {
  /** The body posted, both times. */
  request: AgentTaskBody
  /** What came back with no X-PAYMENT header. */
  payment_required: AgentTaskPaymentRequired
  /** The envelope the resend carried, before base64. */
  payment_envelope: RelayPaymentPayload
  /** What came back on the resend. */
  created: AgentTaskCreated
  /** The decoded x-payment-response header of that resend. */
  settlement: RelaySettlementResponse
  /**
   * What the POLL answers — the third payload every round-one reviewer asked
   * for by name ("the response from polling GET /v1/gigs/{task_id}"), and the
   * step the flow they recited ends on. Captured as the CREATOR sees it, with
   * a bearer, because that is the only reader a draft answers at all.
   */
  polled: GigDetail
}

/**
 * A wire value as an inline example.
 *
 * The round trip is not a type escape: it is what serialisation does to the
 * value on the way out, so anything that would not survive being sent (an
 * `undefined`, a Date, a bigint) is either dropped here or throws here rather
 * than reaching a reader. The single cast is the JSON boundary, where the
 * checker has nothing left to go on.
 */
function asExample(value: object | undefined, field: keyof RecordedExchange): ExampleValue {
  // `| undefined` is not defensive typing: ./recorded-exchange is GENERATED, and
  // a stale or hand-edited one can be missing a field the type says is there —
  // a state the compiler cannot see, and the only one this branch is for.
  // Without the check it fails HERE, at module load, as `JSON.parse`
  // complaining that "undefined" is not valid JSON: a stack with no mention of
  // the recording, on a server that simply does not boot.
  if (value === undefined) {
    throw new Error(`recorded-exchange has no \`${field}\` — re-record with \`pnpm record:x402\``)
  }
  return JSON.parse(JSON.stringify(value)) as ExampleValue
}

/** The base64 an agent actually puts in the header, from the envelope beside it. */
function paymentHeader(recorded: RecordedExchange): string {
  return Buffer.from(JSON.stringify(recorded.payment_envelope)).toString('base64')
}

/** The published header value, for the suites that assert on it. */
export function recordedPaymentHeader(): string {
  return paymentHeader(RECORDED_EXCHANGE)
}

/**
 * The same media-type object with the recorded value beside its `$ref`. The
 * `schema` is carried through untouched, so the drift guard still compares it
 * against the canonical document.
 */
function withExample(content: JsonContent, value: object | undefined, field: keyof RecordedExchange): JsonContent {
  return { [JSON_MEDIA_TYPE]: { ...content[JSON_MEDIA_TYPE], example: asExample(value, field) } }
}

/** One documented response with its recorded body, or nothing if it has no JSON content. */
function recordedResponse(
  responses: OperationObject['responses'],
  status: HttpStatus,
  value: object | undefined,
  field: keyof RecordedExchange,
): Readonly<Record<string, ResponseObject>> {
  const response = responses[status]
  if (response?.content === undefined) return {}
  return { [status]: { ...response, content: withExample(response.content, value, field) } }
}

/** The POST /v1/agent/tasks operation with its request, 402 and 201 recorded. */
function taskOperation(post: OperationObject, recorded: RecordedExchange): OperationObject {
  return {
    ...post,
    ...(post.parameters !== undefined
      ? {
          parameters: post.parameters.map((parameter) =>
            parameter.name === X_PAYMENT_HEADER
              ? { ...parameter, example: paymentHeader(recorded) }
              : parameter,
          ),
        }
      : {}),
    ...(post.requestBody !== undefined
      ? { requestBody: { ...post.requestBody, content: withExample(post.requestBody.content, recorded.request, 'request') } }
      : {}),
    responses: {
      ...post.responses,
      ...recordedResponse(post.responses, '402', recorded.payment_required, 'payment_required'),
      ...recordedResponse(post.responses, '201', recorded.created, 'created'),
    },
  }
}

/**
 * What POST /v1/agent/tasks/validate answers. Not recorded: the schema pins both
 * fields to constants (`ok` true, `moderation` 'not_run'), so there is only one
 * body it can ever carry, and typing it as the wire type keeps it from drifting.
 */
const VALIDATED_EXAMPLE: AgentTaskValidated = { ok: true, moderation: 'not_run' }

/** The validate-only operation: the SAME recorded request body as the one-shot, and its one possible 200. */
function validateOperation(post: OperationObject, recorded: RecordedExchange): OperationObject {
  const ok = post.responses['200']
  return {
    ...post,
    ...(post.requestBody !== undefined
      ? { requestBody: { ...post.requestBody, content: withExample(post.requestBody.content, recorded.request, 'request') } }
      : {}),
    responses: {
      ...post.responses,
      ...(ok?.content !== undefined
        ? { '200': { ...ok, content: { [JSON_MEDIA_TYPE]: { ...ok.content[JSON_MEDIA_TYPE], example: { ...VALIDATED_EXAMPLE } } } } }
        : {}),
    },
  }
}

/** The GET /v1/gigs/{id} operation with the polled task recorded on its 200. */
function gigOperation(get: OperationObject, recorded: RecordedExchange): OperationObject {
  return { ...get, responses: { ...get.responses, ...recordedResponse(get.responses, '200', recorded.polled, 'polled') } }
}

/** The document key the gig detail is filed under — OpenAPI's spelling, not Fastify's. */
const GIG_DETAIL_PATH = apiRoutes.gigs.get.replace(':id', '{id}')

/**
 * The document with the recorded exchange attached. Everything else is carried
 * through by reference — nothing but the `example` keys is touched, which the
 * examples suite holds by identity on the untouched parts.
 *
 * TWO paths carry examples, because the flow the reviewers recited has two
 * halves: the task post (request, 402, 201, X-PAYMENT) and the POLL it ends on.
 * Publishing only the first left a reader at exactly the step ten of ten said
 * they could not see.
 *
 * The recording is a PARAMETER, defaulted, so the guards can run this over a
 * fixture — including the stale one that proves the missing-field refusal
 * actually refuses.
 */
export function withRecordedExamples(
  doc: OpenApiDocument,
  recorded: RecordedExchange = RECORDED_EXCHANGE,
): OpenApiDocument {
  const tasks = doc.paths[apiRoutes.agent.tasks]
  const validate = doc.paths[apiRoutes.agent.tasksValidate]
  const gig = doc.paths[GIG_DETAIL_PATH]
  // Nothing to attach: hand back the very object, rather than an equal copy.
  // Cheap, and it keeps "this function did nothing" checkable by identity.
  if (tasks?.post === undefined && validate?.post === undefined && gig?.get === undefined) return doc
  return {
    ...doc,
    paths: {
      ...doc.paths,
      ...(tasks?.post !== undefined ? { [apiRoutes.agent.tasks]: { ...tasks, post: taskOperation(tasks.post, recorded) } } : {}),
      ...(validate?.post !== undefined ? { [apiRoutes.agent.tasksValidate]: { ...validate, post: validateOperation(validate.post, recorded) } } : {}),
      ...(gig?.get !== undefined ? { [GIG_DETAIL_PATH]: { ...gig, get: gigOperation(gig.get, recorded) } } : {}),
    },
  }
}
