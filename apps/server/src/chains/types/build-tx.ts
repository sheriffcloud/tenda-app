/**
 * `buildTx` inputs and outputs: the per-action payloads (discriminated by
 * `action`, so adapter branches narrow statically) and the unsigned-transaction
 * shapes the client signs.
 */

import type { PermitSignatureBody } from '@tenda/shared'
import type { AmountRaw, AssetId } from './values'

// ---------- buildTx -------------------------------------------------------

// Action-specific payloads. Discriminated by `action` so adapter `buildTx`
// branches narrow the payload statically.

export interface CreateEscrowPayload {
  /**
   * Server-generated DB row id (`escrows.id`, UUID), populated by the route
   * handler from the `INSERT ... RETURNING id` of the draft escrow row.
   * NOT the on-chain `escrow_ref`, that's emitted by the contract.
   */
  escrow_id: string
  kind: 'gig' | 'exchange'
  asset: AssetId
  amount_raw: AmountRaw
  /**
   * User id of the direct-assigned counterparty, if any. The adapter
   * resolves the wallet through its injected resolver (same pattern as
   * `raiser_user_id`) so routes never touch wallet columns.
   */
  assigned_counterparty_user_id?: string
  accept_deadline_unix: number
  completion_duration_seconds: number
  dispute_bond_raw: AmountRaw
  is_seeker: boolean
  /**
   * Acceptance mode. `true` closes `acceptEscrow` and makes `assignAccept`
   * the only path to Accepted. Both contracts reject it combined with
   * `assigned_counterparty_user_id` — the modes are mutually exclusive.
   */
  requires_approval: boolean
  /**
   * Seconds after `assignAccept` during which the creator may still
   * `unassign`. Server-supplied from `platform_config`, bounded on-chain by
   * `ESCROW_LIMITS.min/maxUnassignWindowSeconds`.
   */
  unassign_window_seconds: number
  /**
   * EIP-2612 signature covering `amount_raw`, EVM ERC-20 assets only. When
   * present the builder encodes `createEscrowWithPermit` (allowance rides
   * the tx); validated by lib/escrow-create + the builder (native asset
   * rejects). Routes never forward it to non-eip155 adapters.
   */
  permit?: PermitSignatureBody
}

export interface EscrowIdPayload {
  escrow_id: string
}

export interface AssignAcceptPayload {
  escrow_id: string
  /**
   * User id of the worker the creator is assigning. The adapter resolves the
   * wallet through its injected resolver (same pattern as
   * `assigned_counterparty_user_id` / `raiser_user_id`) so routes never touch
   * wallet columns.
   */
  worker_user_id: string
}

export interface SubmitProofPayload {
  escrow_id: string
  /** 32-byte hex (EVM) or base58 (Solana) hash of the proof bundle. */
  proof_hash: string
}

export interface DisputeEscrowPayload {
  escrow_id: string
  /** Bond `msg.value` for EVM; lamport transfer for Solana. */
  bond_raw: AmountRaw
  /** EIP-2612 signature covering the ERC-20 bond (disputeEscrowWithPermit). */
  permit?: PermitSignatureBody
}

export interface ResolveDisputePayload {
  escrow_id: string
  winner: 'creator' | 'counterparty' | 'split'
  /**
   * User id of the party that raised the dispute (`disputes.raised_by`).
   * Solana's `resolve_dispute_*` takes the raiser's wallet as an instruction
   * argument (bond routing), the adapter resolves the wallet through its
   * injected resolver. The EVM contract records the raiser on-chain at
   * `disputeEscrow` and ignores this field.
   */
  raiser_user_id: string
}

/**
 * The action being built, discriminated by `action` so adapter branches narrow
 * the payload statically. `BuildTxArgs` below adds the cross-action fields.
 */
export type BuildTxAction =
  | { action: 'createEscrow'; user_id: string; payload: CreateEscrowPayload }
  | { action: 'acceptEscrow'; user_id: string; payload: EscrowIdPayload }
  | { action: 'declineAssignedEscrow'; user_id: string; payload: EscrowIdPayload }
  | { action: 'assignAccept'; user_id: string; payload: AssignAcceptPayload }
  | { action: 'unassign'; user_id: string; payload: EscrowIdPayload }
  | { action: 'submitProof'; user_id: string; payload: SubmitProofPayload }
  | { action: 'approveCompletion'; user_id: string; payload: EscrowIdPayload }
  | { action: 'claimStalledPayment'; user_id: string; payload: EscrowIdPayload }
  | { action: 'cancelEscrow'; user_id: string; payload: EscrowIdPayload }
  | { action: 'refundExpired'; user_id: string; payload: EscrowIdPayload }
  | { action: 'reclaimAbandoned'; user_id: string; payload: EscrowIdPayload }
  | { action: 'disputeEscrow'; user_id: string; payload: DisputeEscrowPayload }
  // resolveDispute is signed by the chain's configured dispute-resolution
  // authority (NOT the calling admin's personal wallet), so the signer address
  // is passed explicitly rather than resolved from the admin's `user_wallets`.
  // Solana bakes it in as fee-payer + `disputeAdmin`; EVM signs from the
  // connected authority wallet (this is the pre-flighted address). `user_id`
  // stays for tx-attempt attribution only.
  | { action: 'resolveDispute'; user_id: string; signer_address: string; payload: ResolveDisputePayload }

/**
 * A build request: the action, plus the contract it must be built against.
 *
 * Intersected rather than added to each variant so every existing `action`
 * narrowing keeps working unchanged.
 */
export type BuildTxArgs = BuildTxAction & {
  /**
   * The escrow contract/program this transaction must target — resolved from
   * the ESCROW (`chains/contracts/resolve.ts`), not from the chain.
   *
   * Omitted means "the chain's current contract", which is correct for
   * `createEscrow` (a new escrow always joins the current deployment) and for
   * any caller with no escrow in hand. For a transition it must be supplied:
   * an escrow funded before a redeploy still holds its money in the previous
   * contract, and building against the current one produces a transaction that
   * reverts, leaving the funds unreachable (open_issues #89).
   */
  contract?: string
}

/**
 * ERC-4337 UserOperation shape. Per the spec; bundlers expect every field
 * present (some can be `'0x'` for empty). Each value is hex-string so we
 * don't lose u256 precision through JS `number`.
 */
export interface UserOperation {
  sender: `0x${string}`
  nonce: `0x${string}`
  init_code: `0x${string}`
  call_data: `0x${string}`
  call_gas_limit: `0x${string}`
  verification_gas_limit: `0x${string}`
  pre_verification_gas: `0x${string}`
  max_fee_per_gas: `0x${string}`
  max_priority_fee_per_gas: `0x${string}`
  paymaster_and_data: `0x${string}`
  signature: `0x${string}`
}

export type UnsignedTx =
  | {
      kind: 'solana-tx'
      /** base64-serialized unsigned versioned transaction. */
      tx_base64: string
      recent_blockhash: string
      last_valid_block_height: number
    }
  | {
      kind: 'evm-tx'
      to: `0x${string}`
      data: `0x${string}`
      value: AmountRaw
      gas_limit?: AmountRaw
      /**
       * CELO gas abstraction (stage-4): pay gas in this whitelisted ERC-20
       * (cUSD) instead of native CELO. Wallets that support the field show
       * "Gas fee: 0.001 cUSD"; absent everywhere else.
       */
      fee_currency?: `0x${string}`
      /**
       * ERC-20 prerequisite the wallet must satisfy BEFORE broadcasting a
       * plain call: allowance(owner → spender) ≥ amount_raw, topped up via
       * approve() if short. Absent for native assets and permit-built calls
       * (there the allowance rides the tx itself). Mirrors the shared wire
       * contract (escrows.contract.ts UnsignedTx).
       */
      approval?: { token: string; spender: string; amount_raw: AmountRaw }
    }
  | {
      kind: 'evm-userop'
      user_op: UserOperation
      entry_point: `0x${string}`
      paymaster_url?: string
    }
