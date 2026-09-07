/**
 * v2 escrow domain types — inferred from the promoted schema so they can
 * never drift from the DB. Wire projections (summaries returned by list
 * endpoints) serialize timestamps as ISO strings; row types keep Drizzle's
 * Date columns.
 */
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type {
  escrows,
  escrow_transactions,
  escrow_proofs,
  disputes,
  gig_details,
  exchange_details,
  escrowKindEnum,
  escrowStatusEnum,
} from '../db/schema'
import type { EscrowTxType } from '../constants/escrow'

export type Escrow = InferSelectModel<typeof escrows>
export type NewEscrow = InferInsertModel<typeof escrows>
export type EscrowTransaction = InferSelectModel<typeof escrow_transactions>
export type EscrowProof = InferSelectModel<typeof escrow_proofs>
export type Dispute = InferSelectModel<typeof disputes>
export type NewDispute = InferInsertModel<typeof disputes>
export type GigDetailsRow = InferSelectModel<typeof gig_details>
export type ExchangeDetailsRow = InferSelectModel<typeof exchange_details>

export type EscrowKind = (typeof escrowKindEnum.enumValues)[number]
export type EscrowStatus = (typeof escrowStatusEnum.enumValues)[number]

/**
 * An escrow_transaction enriched with minimal escrow context for the
 * wallet screen (replaces the legacy gig/exchange transaction split).
 */
export interface UserEscrowTransaction {
  id: string
  escrow_id: string
  type: EscrowTxType
  tx_ref: string
  amount_raw: string | null
  platform_fee_raw: string | null
  /** Resolve rows only: the creator's principal share (amount_raw carries the counterparty's). */
  creator_payout_raw: string | null
  actor_id: string | null
  created_at: string
  /** Populated for resolve transactions only; null otherwise. */
  winner: 'creator' | 'counterparty' | 'split' | null
  escrow: {
    id: string
    kind: EscrowKind
    /** gig_details.title for gigs; null for exchanges. */
    title: string | null
    amount_raw: string
    asset: string
    chain_id: string
    status: EscrowStatus
    creator_id: string
    counterparty_id: string | null
  }
}

/**
 * Kind-agnostic listing row: escrows ⨝ gig_details/exchange_details.
 * Serves "my escrows" (/v1/users/:id/escrows); the admin listing extends
 * it with creator identity columns.
 */
export interface EscrowListRow {
  id: string
  kind: EscrowKind
  status: EscrowStatus
  chain_id: string
  asset: string
  amount_raw: string
  /** gig_details.title for gigs; null for exchanges. */
  title: string | null
  /** exchange_details.fiat_currency for exchanges; null for gigs. */
  fiat_currency: string | null
  creator_id: string
  counterparty_id: string | null
  accept_deadline: string | null
  created_at: string
}

// ── Query types ───────────────────────────────────────────────────────

export type UserEscrowsQuery = {
  role?: 'creator' | 'counterparty'
  kind?: EscrowKind
  /**
   * CAIP-2 settlement chain (`escrows.chain_id`). Same contract as
   * `GigListQuery.chain_id` — validated against the running chain registry.
   */
  chain_id?: string
  limit?: number
  offset?: number
}

export type UserTransactionsQuery = {
  limit?: number
  offset?: number
}

/**
 * Lifetime USDC earned/spent for one user — a SQL aggregate over EVERY row,
 * deliberately NOT derivable from the paginated transaction feed.
 *
 * The wallet screen used to reduce over whatever page happened to be loaded
 * and label the result "lifetime", which understated it for anyone past the
 * first page and would have drifted upward as they scrolled once the feed
 * paginated (open_issues MB1).
 *
 * Amounts are raw base units summed across every USDC asset — all USDC
 * variants in `ASSET_META` share 6 decimals, so the units are commensurable;
 * `asset` names the variant whose decimals apply, for display conversion.
 */
export interface UserTransactionsSummary {
  /** Chain-attested NET credits to the user as counterparty. */
  earned_raw: string
  /** Principal the user locked as escrow creator. */
  spent_raw: string
  /** Asset id whose decimals the raw totals are expressed in. */
  asset: string
}
