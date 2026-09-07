/**
 * The Agent API v0 path items — the four public, read-only gig endpoints and
 * nothing else. Bearer-only query keys (`mine`, `status`) and bearer-scoped
 * response fields exist on the live routes but are outside the v0 guarantee,
 * and each operation's description says so.
 *
 * Paths are spelled against the shared route map so they cannot drift from
 * what the clients call; the integration drift test then proves the server
 * serves each one.
 */
import {
  AMOUNT_RAW_PATTERN,
  GIG_CATEGORIES,
  GIG_LIST_SORTS,
  MAX_PAGINATION_LIMIT,
  MAX_PROXIMITY_RADIUS_KM,
  apiRoutes,
} from '@tenda/shared'
import { ref, type SchemaObject } from './schema-types'
import { COUNTRY_CODES, chainId, latitude, longitude, uuid } from './scalars'

export interface ParameterObject {
  name: string
  in: 'query' | 'path' | 'header'
  required?: boolean
  description?: string
  schema: SchemaObject
}

/** The one media type this API speaks. */
export const JSON_MEDIA_TYPE = 'application/json'
export type JsonContent = Readonly<Record<typeof JSON_MEDIA_TYPE, { schema: SchemaObject }>>

/** An HTTP status this API documents — a 2xx, 4xx or 5xx code, as the string key OpenAPI uses. */
export type HttpStatus = `${'2' | '4' | '5'}${number}`

/** The security schemes `components.securitySchemes` declares; a requirement may name nothing else. */
export type SecuritySchemeName = 'bearer'
export type SecurityRequirement = Readonly<Record<SecuritySchemeName, readonly string[]>>

export interface ResponseObject {
  description: string
  content?: JsonContent
}

export interface OperationObject {
  operationId: string
  summary: string
  description: string
  tags: readonly string[]
  parameters?: readonly ParameterObject[]
  /** v1 write operations; absent on the v0 reads. */
  requestBody?: { required: true; content: JsonContent }
  /** `[{ bearer: [] }]` on the operations that need a token; absent = anonymous. */
  security?: readonly SecurityRequirement[]
  responses: Readonly<Record<HttpStatus, ResponseObject>>
}

/** One path: the v0 reads are GET-only, the v1 writes POST-only; both appear in one map. */
export type PathItem = Readonly<Partial<Record<'get' | 'post', OperationObject>>>

/** The operations a path item carries, method-agnostic — for the tests that walk every response. */
export function operationsOf(item: PathItem): readonly OperationObject[] {
  return [item.get, item.post].filter((op): op is OperationObject => op !== undefined)
}

export const json = (schema: SchemaObject): JsonContent => ({ [JSON_MEDIA_TYPE]: { schema } })
export const errorResponse = (description: string): ResponseObject => ({ description, content: json(ref('ApiError')) })

const query = (name: string, schema: SchemaObject, description: string): ParameterObject => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
})

/** A boolean carried as querystring TEXT — the routes compare the string. */
const boolText: SchemaObject = { type: 'string', enum: ['true', 'false'] }
/** Canonical base-unit integer — the same rule `isAmountRaw` refuses with. */
const amountText: SchemaObject = { type: 'string', pattern: AMOUNT_RAW_PATTERN.source }

/** The filters the public feed and its facets share. */
const PUBLIC_FEED_FILTERS: readonly ParameterObject[] = [
  query('country', { type: 'string', enum: COUNTRY_CODES }, 'ISO-3166 alpha-2 work country'),
  query('remote', boolText, 'Only remote (true) or only on-site (false) gigs'),
  query('cross_border', boolText, 'Only gigs whose work country differs from the poster\'s'),
  query('city', { type: 'string' }, 'Work city, matched exactly as sent'),
  query('category', { type: 'string', enum: GIG_CATEGORIES }, 'Gig category'),
  query('chain_id', chainId, 'CAIP-2 settlement chain; a chain this deployment has not enabled answers 400'),
  query('q', { type: 'string' }, 'Full-text search over title + description; orders by relevance unless `sort` is set'),
  query('min_amount_raw', amountText, 'Inclusive lower bound, base units; must not exceed max_amount_raw'),
  query('max_amount_raw', amountText, 'Inclusive upper bound, base units'),
  query('lat', latitude, 'Proximity centre — all three of lat/lng/radius_km or none'),
  query('lng', longitude, 'Proximity centre'),
  query('radius_km', { type: 'number', exclusiveMinimum: 0, maximum: MAX_PROXIMITY_RADIUS_KM }, 'Proximity radius, km'),
]

const PAGING: readonly ParameterObject[] = [
  query('sort', { type: 'string', enum: GIG_LIST_SORTS }, 'Ordering; default is recency (or relevance with `q`)'),
  query('limit', { type: 'integer', minimum: 1, maximum: MAX_PAGINATION_LIMIT }, 'Page size (server-clamped into this range)'),
  query('offset', { type: 'integer', minimum: 0 }, 'Offset paging; ignored when `cursor` is sent'),
  query('cursor', { type: 'string' }, 'Opaque `next_cursor` from a previous recency-ordered page; incompatible with `sort` and `q`'),
]

const NOT_IN_V0 =
  ' The bearer-only query keys `mine` and `status` (own listings, any status) exist on this route but are outside the v0 guarantee.'

/**
 * Keyed by the route PATH. `string`, not a literal union, because the keys are
 * computed from the shared route map (whose values are typed `string`); the
 * drift test proves every key is served on its method.
 */
export const AGENT_API_PATHS: Readonly<Record<string, PathItem>> = {
  [apiRoutes.gigs.list]: {
    get: {
      operationId: 'listOpenGigs',
      summary: 'The public feed: open, funded, unassigned gigs',
      description:
        'Every gig a stranger may take. Public = kind gig, status open, not taken down, not a direct invite, and the accept deadline (if any) not yet passed. Ordering is total (ties broken by escrow id), so pages never repeat or skip a row.' +
        NOT_IN_V0,
      tags: ['gigs'],
      parameters: [...PUBLIC_FEED_FILTERS, ...PAGING],
      responses: {
        '200': { description: 'A page of the feed', content: json(ref('PaginatedGigs')) },
        '400': errorResponse('An unknown country/category/chain, a malformed amount or proximity triple, or a cursor that is invalid or combined with `sort`/`q`'),
      },
    },
  },
  [apiRoutes.gigs.facets]: {
    get: {
      operationId: 'gigFacets',
      summary: 'Counts per feed cell for the current filters',
      description:
        'Each number is how many gigs the feed would return if that cell were selected — the current filters with that cell\'s own key replaced. Remote gigs carry no country and sit in no country bucket.',
      tags: ['gigs'],
      parameters: PUBLIC_FEED_FILTERS,
      responses: {
        '200': { description: 'Counts', content: json(ref('GigFacets')) },
        '400': errorResponse('The same refusals as the feed'),
      },
    },
  },
  [apiRoutes.gigs.featured]: {
    get: {
      operationId: 'featuredGigs',
      summary: 'The curated rail',
      description: 'Editor-featured open gigs, cached server-side for a short window.',
      tags: ['gigs'],
      responses: { '200': { description: 'Featured gigs', content: json(ref('FeaturedGigs')) } },
    },
  },
  [apiRoutes.gigs.get.replace(':id', '{id}')]: {
    get: {
      operationId: 'getGig',
      summary: 'One gig, with its escrow facts and proof requirements',
      description:
        'Public for any open gig. `proof_requirements` and `proof_params` state what a worker must hand over before submitting — geotag check-ins are verified within `radius_m` of the gig pin, structured payloads must conform to the declared fields. Drafts, taken-down listings and unknown ids answer 404 identically. With a bearer, parties additionally receive counterparty, proofs and dispute; anonymous readers receive null/[]/null.',
      tags: ['gigs'],
      parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
      responses: {
        '200': { description: 'The gig', content: json(ref('GigDetail')) },
        '404': errorResponse('Not public, or no such gig'),
      },
    },
  },
}
