/**
 * Component schemas for the Agent API v0 document — the public gig read
 * surface's wire shapes, written as CLOSED objects (`additionalProperties:
 * false`). That closure is the drift mechanism: the integration test validates
 * real responses against these, so a field that reaches the wire without
 * reaching this file fails a test rather than silently widening the contract.
 *
 * Every enum is DERIVED from the shared constant the server itself enforces
 * (PROOF_TYPES, GIG_CATEGORIES, escrowStatusEnum, LOCATIONS…), so a vocabulary
 * change lands here without a hand edit.
 *
 * Every object is `closedFor<WireType>` (./schema-types): the compiler holds
 * each schema to the exact keys of the shared type it documents, so a wire
 * field the type gains fails the build until it is documented here.
 */
import {
  AMOUNT_RAW_PATTERN,
  APPLICATION_STATUSES,
  DISPUTE_WINNER_CODE,
  ErrorCode,
  GIG_CATEGORIES,
  PROOF_TYPES,
  type ApiError,
  type Dispute,
  type GigApplication,
  type GigDetail,
  type GigFacets,
  type GigSummary,
  type GigViewerContext,
  type GigsContract,
  type PaginatedResponse,
  type Review,
  type UserRef,
} from '@tenda/shared'
import { escrowStatusEnum } from '@tenda/shared/db/schema'
import { FEATURED_RAIL_LIMIT } from '@server/lib/featured'
import { allKeys, closed, closedFor, nullable, ref, type SchemaObject, type V0ComponentName } from './schema-types'
import { COUNTRY_CODES, chainId, isoInstant, latitude, longitude, rawAmount, uuid } from './scalars'
import { escrowProof, proofParams } from './schemas-proofs'

const userRef = closedFor<UserRef>(
  {
    id: uuid,
    first_name: nullable({ type: 'string' }),
    last_name: nullable({ type: 'string' }),
    avatar_url: nullable({ type: 'string' }),
    review_score: nullable({ type: 'string', description: 'Average 0–5 as a decimal string, e.g. "4.80"' }),
    is_seeker: { type: 'boolean' },
    is_agent: { type: 'boolean', description: 'True when this account is an autonomous agent (registered by wallet at /v1/agent/register); surfaces badge it so a human always knows.' },
    country: nullable({ type: 'string', enum: COUNTRY_CODES }),
  },
  ['id', 'first_name', 'last_name', 'avatar_url', 'review_score', 'is_seeker', 'is_agent', 'country'],
  'A user as other users see them.',
)

const dispute = closedFor<Dispute>(
  {
    id: uuid,
    escrow_id: uuid,
    raised_by: uuid,
    reason: { type: 'string' },
    assigned_to: nullable(uuid),
    assigned_at: nullable(isoInstant),
    winner: nullable({ type: 'string', enum: Object.keys(DISPUTE_WINNER_CODE) }),
    resolved_by: nullable(uuid),
    resolved_at: nullable(isoInstant),
    created_at: isoInstant,
  },
  ['id', 'escrow_id', 'raised_by', 'reason', 'assigned_to', 'assigned_at', 'winner', 'resolved_by', 'resolved_at', 'created_at'],
)

const review = closedFor<Review>(
  {
    id: uuid,
    escrow_id: uuid,
    reviewer_id: uuid,
    reviewee_id: uuid,
    score: { type: 'integer', minimum: 1, maximum: 5 },
    comment: nullable({ type: 'string' }),
    created_at: isoInstant,
  },
  ['id', 'escrow_id', 'reviewer_id', 'reviewee_id', 'score', 'comment', 'created_at'],
)

const gigApplication = closedFor<GigApplication>(
  {
    id: uuid,
    escrow_id: uuid,
    applicant_id: uuid,
    message: nullable({ type: 'string' }),
    wallet_address: nullable({ type: 'string' }),
    status: { type: 'string', enum: APPLICATION_STATUSES },
    expires_at: isoInstant,
    created_at: isoInstant,
  },
  ['id', 'escrow_id', 'applicant_id', 'message', 'wallet_address', 'status', 'expires_at', 'created_at'],
)

const viewer = closedFor<GigViewerContext>(
  {
    application: nullable(ref('GigApplication')),
    open_application_count: nullable({ type: 'integer', minimum: 0 }),
  },
  ['application', 'open_application_count'],
  'Bearer-scoped facts; null for anonymous readers. Outside the v0 guarantee.',
)

/** The listing fields — the SUMMARY, and the first half of the DETAIL. */
const GIG_SUMMARY_PROPERTIES: Readonly<Record<keyof GigSummary, SchemaObject>> = {
  escrow_id: uuid,
  public_feed_revision: { type: 'string', pattern: AMOUNT_RAW_PATTERN.source, description: 'Realtime revision, decimal string' },
  chain_id: chainId,
  asset: { type: 'string', description: 'Asset id, e.g. USDC_SOL' },
  amount_raw: rawAmount,
  status: { type: 'string', enum: escrowStatusEnum.enumValues },
  accept_deadline: nullable(isoInstant),
  created_at: isoInstant,
  title: { type: 'string' },
  description: nullable({ type: 'string' }),
  category: { type: 'string', enum: GIG_CATEGORIES },
  country: nullable({ type: 'string', enum: COUNTRY_CODES }),
  city: nullable({ type: 'string' }),
  latitude: nullable(latitude),
  longitude: nullable(longitude),
  remote: { type: 'boolean' },
  cross_border: { type: 'boolean' },
  proof_requirements: { type: 'array', items: { type: 'string', enum: PROOF_TYPES } },
  proof_params: nullable(ref('ProofParams')),
  requires_approval: { type: 'boolean' },
  creator: ref('UserRef'),
}
const GIG_SUMMARY_REQUIRED = allKeys<GigSummary>(GIG_SUMMARY_PROPERTIES)

const gigSummary = closedFor<GigSummary>(GIG_SUMMARY_PROPERTIES, GIG_SUMMARY_REQUIRED, 'One listing in the public feed.')

type GigDetailOnly = Omit<GigDetail, keyof GigSummary>
const GIG_DETAIL_ONLY: Readonly<Record<keyof GigDetailOnly, SchemaObject>> = {
  hidden: { type: 'boolean' },
  completion_duration_seconds: nullable({ type: 'integer' }),
  completion_deadline: nullable(isoInstant),
  submitted_at: nullable(isoInstant),
  approval_deadline: nullable(isoInstant),
  dispute_bond_raw: rawAmount,
  my_signer_address: nullable({ type: 'string', description: 'Bearer-scoped; null for anonymous readers' }),
  assigned_counterparty_id: nullable(uuid),
  is_assigned: { type: 'boolean' },
  unassign_window_seconds: { type: 'integer', minimum: 0 },
  assignment_released_at: nullable(isoInstant),
  counterparty: nullable(ref('UserRef')),
  proofs: { type: 'array', items: ref('EscrowProof') },
  dispute: nullable(ref('Dispute')),
  reviews: { type: 'array', items: ref('Review') },
  is_seeker: { type: 'boolean' },
  viewer: nullable(ref('Viewer')),
}

const gigDetail = closedFor<GigDetail>(
  { ...GIG_SUMMARY_PROPERTIES, ...GIG_DETAIL_ONLY },
  [...GIG_SUMMARY_REQUIRED, ...allKeys<GigDetailOnly>(GIG_DETAIL_ONLY)],
  'The listing plus its escrow facts. counterparty/proofs/dispute are PARTY-scoped: anonymous readers receive null/[]/null.',
)

/**
 * One non-negative count per key of a COMPLETE vocabulary — `Record<K, number>`
 * on the wire. The keys ARE the vocabulary array, so there is no separate type
 * to bind to here; `closedFor<GigFacets>` below binds which vocabularies exist.
 */
const counts = (keys: readonly string[]): SchemaObject =>
  closed(Object.fromEntries(keys.map((key) => [key, { type: 'integer', minimum: 0 }])), keys)

const gigFacets = closedFor<GigFacets>(
  {
    category: counts(GIG_CATEGORIES),
    country: counts(COUNTRY_CODES),
    remote: { type: 'integer', minimum: 0 },
    cross_border: { type: 'integer', minimum: 0 },
  },
  ['category', 'country', 'remote', 'cross_border'],
  'Counts per feed-rail cell: each answers "how many gigs if this cell were clicked".',
)

/** `has_more` is declared on the shared page type and populated by no route — see the note below. */
type GigPage = Omit<PaginatedResponse<GigSummary>, 'has_more'>
const paginatedGigs = closedFor<GigPage>(
  {
    data: { type: 'array', items: ref('GigSummary') },
    total: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1 },
    offset: { type: 'integer', minimum: 0 },
    next_cursor: nullable({ type: 'string', description: 'Opaque keyset cursor; present on recency-ordered pages' }),
  },
  ['data', 'total', 'limit', 'offset'],
  // No `has_more`: the shared PaginatedResponse declares it, but no route
  // populates it (see shared/pagination/page.ts) — a documented field the
  // producer never sends is a promise an agent would wait on. Paging is
  // `offset + data.length < total`, or `next_cursor` when present.
  'One page of the feed.',
)

const apiError = closedFor<ApiError>(
  {
    statusCode: { type: 'integer' },
    error: { type: 'string' },
    message: { type: 'string' },
    code: { type: 'string', enum: Object.values(ErrorCode) },
    details: { type: 'object', additionalProperties: true },
  },
  ['statusCode', 'error', 'message', 'code'],
  'Every non-2xx answer.',
)

export const AGENT_API_SCHEMAS: Readonly<Record<V0ComponentName, SchemaObject>> = {
  UserRef: userRef,
  ProofParams: proofParams,
  EscrowProof: escrowProof,
  Dispute: dispute,
  Review: review,
  GigApplication: gigApplication,
  Viewer: viewer,
  GigSummary: gigSummary,
  GigDetail: gigDetail,
  GigFacets: gigFacets,
  PaginatedGigs: paginatedGigs,
  FeaturedGigs: closedFor<GigsContract['featured']['response']>(
    { data: { type: 'array', items: ref('GigSummary'), maxItems: FEATURED_RAIL_LIMIT } },
    ['data'],
    'The curated rail — a carousel, capped, never a second feed.',
  ),
  ApiError: apiError,
}
