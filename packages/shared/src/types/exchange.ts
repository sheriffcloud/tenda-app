/**
 * Exchange READ surface (post-cutover). P2P exchanges are escrows with
 * kind='exchange' — creation and transitions go through /v1/escrows.
 * This file types the order-book browse surface: /v1/exchange and
 * /v1/exchange/:id, both served from escrows ⨝ exchange_details and both
 * ANONYMOUS since #179. The old note here said the listing was "gated by
 * advanced_mode_enabled", which was wrong in both halves even before that:
 * that flag has only ever gated offer CREATION, and the listing's gate was
 * plain authentication.
 */
import type { Dispute, EscrowProof, EscrowStatus } from './escrow'
import type { Review } from './review'
import type { User, UserRef } from './user'
import type { PayoutRailKind } from '../fiat/payout/types'

// ── Wire projections ──────────────────────────────────────────────────

/**
 * Who posted an offer, as a STRANGER may see them (#175).
 *
 * Not `UserRef`. That type carries `first_name`, `last_name` and `avatar_url`,
 * and an exchange row pairs whoever posted it with the money they are moving
 * and a clock — a full legal name and a face beside that is a targeting list,
 * which is how P2P fraud actually approaches a seller. `UserRef` stays exactly
 * as it is for `/v1/gigs`, where publishing the poster IS the product and the
 * feed is deliberately indexable; the money-movement pairing is what makes
 * exchange different.
 *
 * `full_name` and `avatar_url` are null until the viewer is a SETTLED party —
 * the same line `payout_account` already sits behind on the detail route, and
 * for the same stated reason: a pending assignee has not accepted, so the
 * seller's identity is not theirs to read yet.
 *
 * WHAT THIS DOES NOT DO, so nobody reads it as more than it is: `id` is still
 * here — the profile link and the chat href are built from it — and
 * `GET /v1/users/:id` is anonymous and answers with the name and the face. So
 * this withholds the PAIRING from a feed, not the identity from a determined
 * reader: re-pairing costs one attributable request per row instead of none.
 * That is a real raise in cost and it is not a seal. `#180` holds the decision.
 */
export type ExchangePartyRef = Pick<
  User,
  'id' | 'review_score' | 'is_seeker' | 'is_agent' | 'country'
> & {
  /** "Wisdom A." — `abbreviatedName`, or '' for a party with no profile name. */
  display_name: string
  /** Null unless the viewer is a SETTLED party to THIS escrow. */
  full_name: string | null
  /** Null unless the viewer is a SETTLED party to THIS escrow. */
  avatar_url: string | null
}

/** Order-book listing item: escrows ⨝ exchange_details. */
export interface ExchangeSummary {
  /** The escrow id — also the path param for /v1/escrows/:id/* actions. */
  escrow_id: string
  chain_id: string
  asset: string
  amount_raw: string
  status: EscrowStatus
  /** numeric(20,4) — string on the wire. */
  fiat_amount: string
  fiat_currency: string
  /** numeric(30,10) fiat per whole asset unit — string on the wire. */
  rate: string
  payment_window_seconds: number
  accept_deadline: string | null
  created_at: string
  creator: ExchangePartyRef
}

/**
 * The seller's payout account, as revealed to an accepted buyer so they can
 * pay the fiat off-platform. Carries the FULL account_number (unlike the
 * owner-facing masked BankAccountSummary) — a matched buyer needs it to
 * transfer. Server exposes it ONLY to the offer's settled parties; null otherwise.
 */
export interface ExchangePayoutAccount {
  kind: PayoutRailKind
  bank_code: string
  account_number: string
  account_name: string
  country: string
}

export interface ExchangeDetail extends ExchangeSummary {
  /** CO1 takedown, same meaning and same (absent) scoping as the gig detail's. */
  hidden: boolean
  /**
   * Fee tier baked into the escrow at creation (escrows.is_seeker). Pairs
   * with the live platform-config bps to project the buyer's net payout —
   * the same mirror-of-contract math the gig surface uses.
   */
  is_seeker: boolean
  /** Buyer's fiat receipt — PARTIES ONLY, `null` to everyone else incl. admins. */
  payment_proof_url: string | null
  /** Viewer-relative bound wallet — same meaning and scoping as GigDetail's. */
  my_signer_address: string | null
  dispute_bond_raw: string
  completion_deadline: string | null
  submitted_at: string | null
  approval_deadline: string | null
  /**
   * How this offer may be taken up — the three fields of `EscrowAcceptanceMode`,
   * with the same meanings and the same scoping as the gig detail.
   *
   * Carried even though every value is currently the unrestricted one, because
   * only two of the three are guaranteed to be. `assigned_counterparty_id` has
   * NO kind restriction at create (unlike `requires_approval`, which is
   * gig-only and rejected here), so a direct-invite exchange offer is a
   * reachable state the wire previously could not describe — leaving the client
   * to assume "open to anyone" and offer a stranger an Accept the server
   * answers with 403. `requires_approval` rides along as the actual column
   * value rather than a literal, so opening approval mode to exchanges stays a
   * server change with no client edit.
   *
   * `escrowPartiesOf` is what projects these three onto the shape `canAccept`
   * reads, for this wire and the gig one alike.
   */
  requires_approval: boolean
  /** Whether a DIRECT INVITE names someone. Public, like the gig detail's. */
  is_assigned: boolean
  /** WHO is invited — PARTIES ONLY (the invitee is a party), else `null`. */
  assigned_counterparty_id: string | null
  /**
   * The private half of the trade — PARTIES ONLY, withheld as `null` / `[]` /
   * `null` for anyone else, admins included. Same rule as the gig detail; an
   * offer being readable is not a licence to read the trade on it. Mediation
   * reads it through the admin surfaces — see `lib/escrow-detail-scope.ts`.
   */
  counterparty: UserRef | null
  proofs: EscrowProof[]
  dispute: Dispute | null
  /** Public: the same rows a profile serves. Reputation is public by design. */
  reviews: Review[]
  /** Seller's payout account — present only for the offer's settled parties. */
  payout_account: ExchangePayoutAccount | null
}

// ── Create-detail satellite (CO4 advanced-mode offer creation) ─────────

/**
 * POST /v1/exchange — attach exchange_details to the caller's DRAFT
 * escrow (mirror of the gig create-detail step; the chain-agnostic core
 * comes from POST /v1/escrows first).
 */
export interface CreateExchangeDetailsBody {
  escrow_id: string
  /** Fiat the buyer pays for the whole offer. */
  fiat_amount: number
  /** ISO-4217, must be a SUPPORTED_CURRENCIES member. */
  fiat_currency: string
  /** Fiat per whole asset unit. */
  rate: number
  /** Defaults to EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS. */
  payment_window_seconds?: number
  /**
   * The caller's bank_accounts row the accepted buyer pays into. Required —
   * a sell offer with no payout target can never be settled. The server
   * asserts ownership + fiat-currency consistency.
   */
  payout_account_id: string
}

// ── Query types ───────────────────────────────────────────────────────

export type ExchangeListQuery = {
  currency?: string
  /**
   * CAIP-2 settlement chain (`escrows.chain_id`). Same contract as
   * `GigListQuery.chain_id`: validated against the running chain registry,
   * unknown ids 400 rather than returning an empty order book.
   */
  chain_id?: string
  min_amount_raw?: string
  max_amount_raw?: string
  limit?: number
  offset?: number
}
