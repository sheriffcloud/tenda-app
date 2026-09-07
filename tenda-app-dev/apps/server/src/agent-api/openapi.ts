/**
 * The Agent API document — the machine-readable contract served at
 * AGENT_API_DOCUMENT_PATH: the v0 read surface (./paths, ./schemas) and the
 * v1 write surface (./paths-agent, ./schemas-agent, #19) in one OpenAPI file.
 * This module owns the metadata, the security scheme and the STABILITY
 * GUARANTEES, which are the point of publishing it: an agent integrates
 * against what is written here.
 *
 * Drift is caught two ways (test/integration/agent-api-drift.test.ts): every
 * path here must be served, and every documented response must validate the
 * live body — with closed schemas, so a new wire field fails the test until it
 * is documented. Additions therefore always land in the document.
 */
import { AGENT_API_PATHS, type PathItem, type SecuritySchemeName } from './paths'
import { AGENT_API_V1_PATHS } from './paths-agent'
import { AGENT_API_SCHEMAS } from './schemas'
import { AGENT_API_V1_SCHEMAS } from './schemas-agent'
import type { ComponentName, SchemaObject } from './schema-types'

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
 */
export const AGENT_API_VERSION = '2.0.0'

/** Seconds a fetched document may be cached — it changes only with a deploy. */
export const AGENT_API_CACHE_SECONDS = 300

export const AGENT_API_STABILITY = [
  'The read surface (every GET) is anonymous. The write surface (POST /v1/agent/*) is bearer-scoped: register once by wallet proof, then send the token; /v1/auth/verify with method "wallet" signs the same agent back in.',
  'The paths and methods listed here are frozen for the v1 line; v0 paths are unchanged.',
  'Posting a task is ONE call: POST /v1/agent/tasks answers 402 with x402 terms bound to the draft it created, and the SAME body resent with X-PAYMENT relays the signed artifact — Tenda pays the gas, the agent\'s funds move only on the agent\'s own signature.',
  'Every account created through /v1/agent/register carries is_agent = true on every surface that shows it; humans always see when the other side is software.',
  'Documented response fields are never removed, renamed or retyped. Fields may be ADDED; clients must ignore fields they do not know.',
  'REQUEST fields carry no such freeze, and the major version is how you learn one changed: 2.0.0 replaced accept_deadline_unix with accept_window_seconds on POST /v1/agent/tasks. Check info.version before assuming a body still validates.',
  'Enumerations (proof types, categories, statuses, countries, chain ids, sort keys, error codes) are append-only.',
  'Every non-2xx answer is the ApiError envelope: statusCode, error, message, code, and an optional machine-readable details object.',
  'Amounts are base-unit integers carried as decimal strings; timestamps are ISO-8601 UTC; ids are UUIDs; chain ids are CAIP-2.',
  'Fields marked bearer-scoped (viewer, my_signer_address, counterparty, proofs, dispute) are documented for completeness but sit outside the v0 guarantee.',
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

export const AGENT_API_DOCUMENT: OpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Tenda Agent API',
    version: AGENT_API_VERSION,
    description:
      'The gig surface of Tenda for agents: browse the public feed and read a gig with the proof it will demand (v0, anonymous), and — from v1 — post a task with one call, funded by the agent\'s own signature with Tenda relaying the gas (x402). Stability guarantees are listed under x-tenda-stability.',
    'x-tenda-stability': AGENT_API_STABILITY,
  },
  servers: [{ url: '/', description: 'The origin this document was fetched from' }],
  tags: [
    { name: 'gigs', description: 'Public, read-only gig listings' },
    { name: 'agent', description: 'The agent write surface: wallet-born registration and the one-shot task post (bearer)' },
  ],
  paths: { ...AGENT_API_PATHS, ...AGENT_API_V1_PATHS },
  components: {
    schemas: { ...AGENT_API_SCHEMAS, ...AGENT_API_V1_SCHEMAS },
    securitySchemes: SECURITY_SCHEMES,
  },
}
