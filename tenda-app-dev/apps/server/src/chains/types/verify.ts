/**
 * `verifyTx` inputs/outputs, the decoded-event shape, the on-chain escrow
 * snapshot used for reconciliation, and the wallet auth-signature args.
 */

import type { AmountRaw, CaipAccountId } from './values'
import type { EscrowEvent } from './events'

// ---------- verifyTx ------------------------------------------------------

export interface VerifyTxArgs {
  /**
   * Event the producer expects. Omitted by webhook/polling producers,
   * they only know a signature touched the program; the adapter then
   * matches ANY escrow event in the transaction.
   */
  expected_event?: EscrowEvent
  /** Optional client hint, verified against decoded event payload. */
  escrow_id?: string
}

export interface DecodedEvent {
  name: EscrowEvent
  escrow_ref: string
  /**
   * The escrow contract/program that actually EMITTED this event — the log's
   * `address` on EVM, the owning program on Solana.
   *
   * Carried so `EscrowCreated` can stamp `escrows.escrow_contract` from what the
   * chain attests rather than from what the server intended to call, the same
   * reason settlement amounts are read off the event instead of projected. Once
   * a chain has run more than one contract, "which contract holds this escrow's
   * funds" has no other trustworthy source: `escrow_ref` on EVM is derived from
   * the row id and carries no contract information at all (open_issues #89).
   */
  contract: string
  actor?: CaipAccountId
  /**
   * Action-specific fields decoded from the on-chain payload. All values are
   * stringified so u64/u256 amounts don't lose precision through JS `number`
   * (Number.MAX_SAFE_INTEGER < 2^53; SPL amounts are u64 up to 2^64). Each
   * event shape is defined alongside its decoder in `chains/<ns>/verify.ts`.
   */
  fields: Record<string, string>
}

export type VerifiedTx =
  | { confirmed: false; pending?: boolean; reason?: string }
  | { confirmed: true; failed: true; reason: string }
  | { confirmed: true; failed: false; event: DecodedEvent }
  /**
   * Confirmed on-chain, but the transaction is not an escrow state-change
   * (e.g. a program upgrade, IDL write, or any tx that touched the program
   * without emitting an escrow event). Only produced on the wide-net path
   * (no `expected_event`), where a producer polls every signature touching
   * the program. Terminal + inert: nothing to apply, and, unlike `failed`
   *, no failed attempt is recorded, so program-maintenance traffic never
   * pollutes `tx_attempts`.
   */
  | { confirmed: true; irrelevant: true; failed?: undefined; reason?: string }

// ---------- escrow state snapshot -----------------------------------------

/**
 * Decoded on-chain escrow account state, a snapshot, not an event
 * (resolves open_issues.md §10.10). Field vocabulary matches the DB
 * `escrows` row so reconciliation can diff directly.
 */
export interface EscrowState {
  escrow_ref: string
  /** UUID string recovered from the on-chain 16-byte escrow_id. */
  escrow_id: string
  kind: 'gig' | 'exchange'
  /** SPL mint / ERC-20 address; null = native asset. */
  asset_address: string | null
  amount_raw: AmountRaw
  creator_address: string
  counterparty_address: string | null
  assigned_counterparty_address: string | null
  status:
    | 'open'
    | 'accepted'
    | 'submitted'
    | 'completed'
    | 'cancelled'
    | 'refunded'
    | 'disputed'
    | 'resolved'
  accept_deadline_unix: number
  completion_duration_seconds: number
  /** 0 until accepted. */
  completion_deadline_unix: number
  /** 0 until submitted. */
  approval_deadline_unix: number
  dispute_bond_raw: AmountRaw
  is_seeker: boolean
  requires_approval: boolean
  unassign_window_seconds: number
  created_at_unix: number
}

// ---------- auth-sig verify ----------------------------------------------

export interface VerifyAuthSigArgs {
  address: string
  /**
   * Raw auth-message string the user signed (Tenda-custom template, not
   * strict SIWS/SIWE; see stage-1 § Auth-message template).
   */
  message: string
  /** base64 (Solana) or 0x-hex (EVM). */
  signature: string
}
