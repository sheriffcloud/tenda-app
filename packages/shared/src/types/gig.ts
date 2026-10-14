/**
 * Gig READ surface (post-cutover). Gigs are escrows with kind='gig' —
 * creation and every transition go through /v1/escrows (escrows.contract).
 * This file only types the public browse surface — /v1/gigs (listing),
 * /v1/gigs/:id (detail) and /v1/gigs/facets (the rail's counts) — every one of
 * them served from escrows ⨝ gig_details.
 */
import type { GigCategory } from '../constants/categories'
import type { GigListSort } from '../constants/gig-list'
import type { CountryCode } from '../constants/locations'
import type { ProofType } from '../constants/proofs'
import type { ProofParams } from '../constants/proof-params'
// Type-only, so nothing is emitted and the gig ↔ application pairing stays a
// compile-time relationship rather than a runtime import cycle.
import type { GigViewerContext } from './application'
import type { Dispute, EscrowProof, EscrowStatus } from './escrow'
import type { Review } from './review'
import type { UserRef } from './user'

export type { GigCategory }

// ── Wire projections ──────────────────────────────────────────────────

/** Listing item: escrows ⨝ gig_details, timestamps as ISO strings. */
export interface GigSummary {
  /** The escrow id — also the path param for /v1/escrows/:id/* actions. */
  escrow_id: string
  /** Current per-gig realtime revision; decimal bigint string. */
  public_feed_revision: string
  chain_id: string
  asset: string
  amount_raw: string
  status: EscrowStatus
  accept_deadline: string | null
  /**
   * Always present: `escrows.created_at` is NOT NULL with a default, so every
   * producer reads it as a `Date` and emits `.toISOString()` unconditionally —
   * the shared `toGigSummary` (feed, featured rail, realtime frames) and the
   * detail route's own projection, which builds this shape by hand.
   */
  created_at: string
  title: string
  description: string | null
  category: GigCategory
  country: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  remote: boolean
  cross_border: boolean
  /**
   * Proof types the worker must attach before submitting. Carried on the
   * SUMMARY, not just the detail: a worker has to see the requirement before
   * they accept, or discovering it afterwards is a bait-and-switch.
   */
  proof_requirements: ProofType[]
  /**
   * Per-type params for the requirements (geotag radius, structured fields);
   * null when no required type carries params. On the SUMMARY for the same
   * reason `proof_requirements` is: "within 500 m of the pin" and which fields
   * must be reported are part of what accepting commits a worker to.
   */
  proof_params: ProofParams | null
  /**
   * Approval mode: this gig is assigned by the poster from applications, so a
   * worker APPLIES rather than accepting.
   *
   * On the SUMMARY for the same reason `proof_requirements` is: which action a
   * gig offers has to be visible while browsing. Finding out only on the detail
   * screen — after tapping "Accept" — is the same bait-and-switch.
   */
  requires_approval: boolean
  creator: UserRef
}

export interface GigDetail extends GigSummary {
  /**
   * CO1 takedown: an admin has pulled this listing.
   *
   * On the DETAIL and not the summary, because the browse surfaces filter
   * hidden rows out entirely — a listing item can only ever be `false`. Needs
   * no scoping either: the only readers this route serves a 200 to on a hidden
   * escrow are its PARTIES and admins, so `true` never reaches anyone it is
   * being hidden from. They are also precisely the people who must be told,
   * since the escrow stays fully operable for them.
   */
  hidden: boolean
  completion_duration_seconds: number | null
  completion_deadline: string | null
  submitted_at: string | null
  approval_deadline: string | null
  dispute_bond_raw: string
  /**
   * The wallet THIS VIEWER is bound to on this escrow, chain-attested:
   * creator → their create-signer, counterparty → their accept-signer,
   * pre-accept assignee → the wallet baked at create. `null` for anonymous
   * readers, non-parties, drafts, and escrows that predate the columns. The
   * OTHER party's address is never on the wire, so "owner only" holds
   * structurally rather than by client discipline.
   */
  my_signer_address: string | null
  /**
   * The named assignee — PARTIES ONLY (an admin who is not a party gets `null`
   * here too, and reads the escrow through /v1/admin/escrows/:id/dossier).
   * `null` for an outsider even when the gig is assigned, because a worker's
   * user id is their identity: publishing it would undo the `counterparty`
   * scoping below. Pair with `is_assigned` for the acceptability question.
   */
  assigned_counterparty_id: string | null
  /**
   * Whether a DIRECT INVITE names someone — i.e. `assigned_counterparty_id` is
   * set on the row — reported to everyone. This is narrower than "the gig is
   * taken": an APPROVAL-MODE gig is assigned by installing the counterparty,
   * never this column, so it reports `false` at every status including
   * `accepted`. Read `status` for whether work is under way; read this only for
   * whether Accept is on offer, which is the one question `canAccept` asks
   * (and it short-circuits on `requires_approval` before reaching it).
   *
   * Same definition as the server's `TransitionContext.is_assigned`, so the
   * wire and the state machine cannot mean different things by the word.
   */
  is_assigned: boolean
  /**
   * The escrow's OWN unassign window (mirrored from chain at create, not
   * today's config). With `completion_deadline` and
   * `completion_duration_seconds` above, the client derives when the
   * assignment was made and therefore how long the poster has left to release
   * it — no extra endpoint, and the same derivation both contracts use.
   */
  unassign_window_seconds: number
  /** Set when the assigned worker said they were unavailable (off-chain). */
  assignment_released_at: string | null
  /**
   * The private half of the escrow — PARTIES ONLY. Everyone else, INCLUDING
   * admins, gets the withheld-but-valid forms (`null`, `[]`, `null`), which
   * are the same states an unaccepted / unsubmitted / undisputed gig already
   * has, so no client needs a second code path for "not allowed" vs "not yet".
   *
   * Admins are not an exception here on purpose: this route is reached through
   * a lenient viewer identification whose role claim can be a token lifetime
   * stale, so it reads no role at all. Mediation reads the same evidence
   * through the admin surfaces — see `lib/escrow-detail-scope.ts`.
   */
  counterparty: UserRef | null
  proofs: EscrowProof[]
  dispute: Dispute | null
  /** Public: the same rows a profile serves. Reputation is public by design. */
  reviews: Review[]
  /**
   * Fee tier baked into the escrow at create (from the poster's seeker status).
   * Drives the worker's net-payout display — the contract charges
   * seeker_fee_bps vs fee_bps off this flag.
   */
  is_seeker: boolean
  /**
   * Caller-scoped facts (approval mode). `null` for anonymous readers — the
   * detail is a PUBLIC route, so the bearer is optional and its absence has to
   * be representable rather than guessed at.
   */
  viewer: GigViewerContext | null
}

// ── Input types ───────────────────────────────────────────────────────

/**
 * Body of POST /v1/gigs — attaches the listing satellite to a draft
 * escrow created via POST /v1/escrows.
 */
export interface CreateGigDetailsBody {
  escrow_id: string
  title: string
  description?: string | null
  category: GigCategory
  /** Omitted for remote gigs (they carry no location); required for physical gigs. */
  country?: string
  remote?: boolean
  city?: string
  latitude?: number
  longitude?: number
  /**
   * Optional. Omitted or empty means the gig accepts any evidence, which is
   * how every gig behaved before this field existed.
   */
  proof_requirements?: ProofType[]
  /**
   * Required iff `proof_requirements` includes a param-bearing type (geotag,
   * structured); refused otherwise. See `parseProofParams`.
   */
  proof_params?: ProofParams | null
}

// ── Query types ───────────────────────────────────────────────────────

export type GigListQuery = {
  // status intentionally omitted — public feed is always 'open'
  country?: string
  remote?: boolean
  cross_border?: boolean
  city?: string
  category?: GigCategory
  /**
   * CAIP-2 settlement chain (`escrows.chain_id`), e.g. `solana:devnet`.
   * Validated against the RUNNING chain registry server-side — an unknown
   * (or well-formed but unregistered) id is a 400, never a silent empty page.
   */
  chain_id?: string
  /** S5.3 full-text search over title + description. */
  q?: string
  /**
   * Own listings (auth required): 'created' = I posted, 'working' = I'm
   * the (assigned) counterparty. Returns ALL statuses incl. drafts.
   */
  mine?: 'created' | 'working'
  /**
   * Narrow own listings to these statuses. ONLY valid alongside `mine=` —
   * the public feed is always 'open', so accepting it there would let a
   * caller probe for non-public rows. Serialises as CSV.
   *
   * Pair with `limit: 1` to read a status-bucketed COUNT off `total`, which
   * is how the profile screen gets its stats without pulling a capped page
   * and counting it client-side (open_issues MB2).
   */
  status?: EscrowStatus[]
  min_amount_raw?: string
  max_amount_raw?: string
  sort?: GigListSort
  lat?: number // proximity search centre
  lng?: number
  radius_km?: number
  limit?: number
  offset?: number
  /** Opaque keyset cursor used by the live public feed. */
  cursor?: string
}

// ── Facets ────────────────────────────────────────────────────────────

/**
 * Query for GET /v1/gigs/facets — the public feed's FILTERS and nothing else.
 *
 * Position and ordering are absent because they cannot change a count:
 * `limit`/`offset`/`cursor` choose which page of the same set is returned, and
 * `sort` chooses its order. `mine` and `status` are absent because facets
 * describe the anonymous feed only — the route refuses both rather than
 * silently answering a different question than the caller asked.
 */
export type GigFacetsQuery = Omit<
  GigListQuery,
  'mine' | 'status' | 'sort' | 'limit' | 'offset' | 'cursor'
>

/**
 * Counts for the feed rail's cells (GET /v1/gigs/facets).
 *
 * Every number answers ONE question: how many gigs the reader would get if
 * they clicked that cell. So each facet is counted with the CURRENT filters
 * except its own key — which is exactly what clicking replaces (see the web
 * rail's `gigsHref`, which swaps one key and carries the rest, `city`
 * included). Counting with all filters applied would instead answer "how many
 * of what you are already looking at", and every cell you have not selected
 * would read 0.
 *
 * The two maps are COMPLETE over their vocabularies: the rail draws a cell per
 * category and per market whether or not any gig matches, so an absent key
 * would render as a blank where the honest answer is 0.
 */
export interface GigFacets {
  category: Record<GigCategory, number>
  /**
   * Keyed by ISO-3166 alpha-2. Remote gigs persist no country, so they are in
   * no bucket here — the sum of these counts is not the size of the feed.
   */
  country: Record<CountryCode, number>
  /** Gigs that are remote, with any current `remote` filter lifted. */
  remote: number
  /** Gigs that are cross-border, with any current `cross_border` filter lifted. */
  cross_border: number
}

// ── Helpers ───────────────────────────────────────────────────────────
//
// `isGigAcceptable` and `computeCompletionDeadline` lived here and are gone.
// Neither had a caller anywhere in the workspace — only their own tests — and
// both had become actively misleading:
//
//   - `isGigAcceptable(gig)` answered "can a worker take this?" from status and
//     `accept_deadline` alone, i.e. the PRE-Stage-10 rule. It would say yes on
//     an approval-mode gig, which is the exact mistake `canAccept` was made
//     mode-aware to stop, sitting one autocomplete away under a more inviting
//     name. Use `canAccept` (utils/gig-utils), which takes the acceptance mode
//     as a required field, with `acceptWindowState` for the deadline half.
//   - `computeCompletionDeadline` duplicated the server's helper of the same
//     name (lib/escrow/deadlines.ts) with a different signature, under a
//     docblock claiming to mirror it — a claim nothing checked.
