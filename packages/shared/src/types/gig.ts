/**
 * Gig READ surface (post-cutover). Gigs are escrows with kind='gig' —
 * creation and every transition go through /v1/escrows (escrows.contract).
 * This file only types the public browse surface: /v1/gigs (listing) and
 * /v1/gigs/:id (detail), both served from escrows ⨝ gig_details.
 */
import type { GigCategory } from '../constants/categories'
import type { ProofType } from '../constants/proofs'
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
  created_at: string | null
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
  sort?: 'created_at' | 'amount_asc' | 'amount_desc'
  lat?: number // proximity search centre
  lng?: number
  radius_km?: number
  limit?: number
  offset?: number
  /** Opaque keyset cursor used by the live public feed. */
  cursor?: string
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
