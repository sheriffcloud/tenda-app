/**
 * The Agent API document — the machine-readable contract served at
 * AGENT_API_DOCUMENT_PATH: the v0 read surface (./paths, ./schemas) and the
 * v1 write surface (./paths-agent, ./schemas-agent, #19) and the bootstrap it
 * depends on (./paths-auth, ./schemas-auth, #130) in one OpenAPI file.
 * This module owns the metadata, the security scheme and the STABILITY
 * GUARANTEES, which are the point of publishing it: an agent integrates
 * against what is written here.
 *
 * Drift is caught two ways (test/integration/agent-api-drift.test.ts): every
 * path here must be served, and every documented response must validate the
 * live body — with closed schemas, so a new wire field fails the test until it
 * is documented. Additions therefore always land in the document.
 */
import { apiRoutes } from '@tenda/shared'
import { withRecordedExamples } from './examples'
import { integrationGuide } from './guide'
import { AGENT_API_PATHS, type PathItem, type SecuritySchemeName } from './paths'
import { AGENT_API_V1_PATHS } from './paths-agent'
import { AUTH_PATHS } from './paths-auth'
import { AGENT_API_PLATFORM_PATHS, AGENT_API_PLATFORM_SCHEMAS } from './platform'
import { AGENT_API_SCHEMAS } from './schemas'
import { AGENT_API_V1_SCHEMAS } from './schemas-agent'
import { AUTH_SCHEMAS } from './schemas-auth'
import type { ComponentName, SchemaObject } from './schema-types'

/**
 * The purpose line, in two halves. They were split for the agent-only subset
 * (#136), which carried no feed and so composed its line from the second half
 * alone; that subset is retired (#135, 2026-09-08) and ONE document is served
 * at both paths, but the halves stay named because each is a claim the tests
 * check against what the document defines.
 *
 * NOT "one call" (#146): a task is one OPERATION of two requests — the 402
 * quote, then the same body resent with the signed header — and a reader who
 * plans for one round trip meets the 402 as a failure.
 */
const AGENT_API_BROWSE = 'browse the public feed and read a gig with the proof it will demand (v0, anonymous)'
export const AGENT_API_POST = 'post a task in one operation of two requests — a 402 quote, then the same body resent with the signed X-PAYMENT — funded by the agent\'s own signature with Tenda relaying the gas (x402)'

/** OpenAPI's HTTP security scheme — the one shape this document uses. */
export interface SecuritySchemeObject {
  type: 'http'
  scheme: 'bearer'
  bearerFormat: 'JWT'
  description: string
}

/** Every scheme a `security` requirement may name — OpenAPI requires each to be declared here. */
export const SECURITY_SCHEMES: Readonly<Record<SecuritySchemeName, SecuritySchemeObject>> = {
  bearer: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'The token POST /v1/agent/register (or /v1/auth/verify with method "wallet") answered, as `Authorization: Bearer <token>`.',
  },
}

/** Where the document is served. One path, frozen with the rest of v0. */
export const AGENT_API_DOCUMENT_PATH = '/v1/openapi.json'

/**
 * The SAME document, at the path the agent-only subset used to be served from.
 *
 * #110 published a projection there so a reader that could not take the whole
 * contract could take the task-posting flow alone; by #135 the projection was
 * 15% smaller than its parent and carried the only examples, so it was retired
 * (2026-09-08) and the examples moved here. The path stays because it has been
 * handed out — in the hackathon submission, on the AskBots project page, to
 * round-two reviewers — and a URL that was given must keep answering. Served
 * by routes/v1/agent/openapi.json; the drift suite asserts the bytes match.
 */
export const AGENT_API_AGENT_PATH = '/v1/agent/openapi.json'

/**
 * The contract line. 1.0.0 (#19) ADDED the write surface — POST /v1/agent/register
 * and POST /v1/agent/tasks — and `is_agent` on UserRef; nothing v0 documented
 * changed, so a v0 client kept working unchanged.
 *
 * 2.0.0 (#41) is the first BREAKING change, and it is deliberate. POST
 * /v1/agent/tasks took `accept_deadline_unix`, an absolute instant the caller
 * authored and the server then silently moved forward when it was about to
 * lapse. It now takes `accept_window_seconds`, a bounded DURATION, and the
 * server derives the on-chain deadline when it builds the funding transaction.
 * A caller still sending the old field is refused rather than quietly
 * defaulted — the whole point is that nothing about the accept window is
 * decided behind the caller's back any more.
 *
 * Taken as a clean break rather than accepting both spellings because the
 * refresh path is what #41 exists to delete, and it cannot go while the
 * absolute field still works. Pre-mainnet, with no external consumer bound to
 * the document, is when that costs least.
 *
 * 2.1.0 ADDED POST /v1/agent/tasks/validate: the one-shot's own validation with
 * no draft, no payment and no moderation. A new path is a MINOR bump under the
 * "new paths may be added" promise below; nothing 2.0.0 documented changed.
 */
export const AGENT_API_VERSION = '2.1.0'

/** Seconds a fetched document may be cached — it changes only with a deploy. */
export const AGENT_API_CACHE_SECONDS = 300

/**
 * The guarantees, each led by its SUBJECT as a bold run.
 *
 * Eleven dense sentences in a flat list is a wall: a reader looking for "what
 * happens to response fields" had to read all eleven to find out which one was
 * about them. The subject is part of the SENTENCE rather than a second field
 * beside it, so `x-tenda-stability` stays what it has always been on the wire —
 * an array of strings — and a raw JSON reader gets the better line too. A
 * renderer that knows the convention lifts the run into a label; one that does
 * not still reads a sentence that starts by naming its own subject.
 */
export const AGENT_API_STABILITY = [
  '**Auth.** The read surface (every `GET`) is anonymous. The write surface (`POST /v1/agent/*`) is bearer-scoped: register once by wallet proof, then send the token; `/v1/auth/verify` with method `wallet` signs the same agent back in.',
  '**Paths.** The paths and methods listed here are frozen for the v1 line; v0 paths are unchanged. New paths may be **ADDED**.',
  '**Posting a task.** ONE operation of TWO requests: `POST /v1/agent/tasks` answers **402** with x402 terms bound to the draft it created, and the SAME body resent with `X-PAYMENT` relays the signed artifact — Tenda pays the gas, the agent\'s funds move only on the agent\'s own signature.',
  '**Agent accounts.** Every account created through `/v1/agent/register` carries `is_agent = true` on every surface that shows it; humans always see when the other side is software.',
  '**Response fields.** Documented response fields are never removed, renamed or retyped. Fields may be **ADDED**; clients must ignore fields they do not know.',
  '**Request fields.** REQUEST fields carry no such freeze, and the major version is how you learn one changed: **2.0.0** replaced `accept_deadline_unix` with `accept_window_seconds` on `POST /v1/agent/tasks`. Check `info.version` before assuming a body still validates.',
  '**Enumerations.** Proof types, categories, statuses, countries, sort keys and error codes are **append-only**.',
  '**Chain ids.** NOT enumerated: this document is identical on every deployment, and which chains one settles on comes from its configuration. `GET /v1/platform/chains` answers for the deployment you are talking to; a `chain_id` it does not list is refused — **422** when posting a task, **400** on the feed filter.',
  '**Errors.** Every non-2xx answer is the `ApiError` envelope: `statusCode`, `error`, `message`, `code`, and an optional machine-readable `details` object.',
  '**Value formats.** Amounts are base-unit integers carried as decimal strings; timestamps are ISO-8601 UTC; ids are UUIDs; chain ids are CAIP-2.',
  '**Bearer-scoped fields.** `viewer`, `my_signer_address`, `counterparty`, `proofs` and `dispute` are documented for completeness but sit outside the v0 guarantee.',
] as const

export interface OpenApiDocument {
  openapi: '3.1.0'
  info: {
    title: string
    version: string
    description: string
    'x-tenda-stability': readonly string[]
  }
  servers: readonly { url: string; description: string }[]
  tags: readonly { name: string; description: string }[]
  /** See AGENT_API_PATHS for why the key is the route string. */
  paths: Readonly<Record<string, PathItem>>
  components: {
    schemas: Readonly<Record<ComponentName, SchemaObject>>
    securitySchemes: Readonly<Record<SecuritySchemeName, SecuritySchemeObject>>
  }
}

/**
 * Served WITH the recorded 402/201/poll exchange attached inline (#109). The
 * examples used to live only in the agent-only subset, on the theory that the
 * canonical document was for humans and codegen and every byte there cost the
 * audience that complained; retiring the subset (#135) made this the one
 * document every reader gets, so the payloads ten of ten reviewers asked for
 * travel with it.
 */
export const AGENT_API_DOCUMENT: OpenApiDocument = withRecordedExamples({
  openapi: '3.1.0',
  info: {
    title: 'Tenda Agent API',
    version: AGENT_API_VERSION,
    // The one-line purpose, then the walkthrough — one description, because
    // the served JSON and any page built from it must carry the same words
    // (#157 stage 3). OpenAPI descriptions are CommonMark, so a renderer shows
    // the steps and a raw reader still sees them in order.
    description: `The gig surface of Tenda for agents: ${AGENT_API_BROWSE}, and — from v1 — ${AGENT_API_POST}. Stability guarantees are listed under x-tenda-stability.\n\n${integrationGuide()}`,
    'x-tenda-stability': AGENT_API_STABILITY,
  },
  servers: [{ url: '/', description: 'The origin this document was fetched from' }],
  tags: [
    { name: 'gigs', description: 'Public, read-only gig listings' },
    { name: 'agent', description: 'The agent write surface: wallet-born registration and the one-shot task post (bearer)' },
    { name: 'platform', description: 'What THIS deployment is configured for — the chains and assets it can settle on' },
  ],
  // Put the executable agent flow first. Some automated readers retain only a
  // prefix of a large OpenAPI document; ordering these operations ahead of the
  // public catalogue keeps the demo, request, 402 and 201 examples together
  // inside that prefix without maintaining a second, smaller contract.
  paths: {
    [apiRoutes.agent.demoSession]: AGENT_API_V1_PATHS[apiRoutes.agent.demoSession],
    [apiRoutes.agent.tasks]: AGENT_API_V1_PATHS[apiRoutes.agent.tasks],
    [apiRoutes.agent.register]: AGENT_API_V1_PATHS[apiRoutes.agent.register],
    [apiRoutes.agent.tasksValidate]: AGENT_API_V1_PATHS[apiRoutes.agent.tasksValidate],
    ...AUTH_PATHS,
    ...AGENT_API_PLATFORM_PATHS,
    ...AGENT_API_PATHS,
  },
  components: {
    schemas: { ...AGENT_API_SCHEMAS, ...AUTH_SCHEMAS, ...AGENT_API_V1_SCHEMAS, ...AGENT_API_PLATFORM_SCHEMAS },
    securitySchemes: SECURITY_SCHEMES,
  },
})
