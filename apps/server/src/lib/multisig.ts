/**
 * Squads multisig helpers for the Solana `protocol_admin` 3-of-5 (locked
 * decision #5). This is still the **typed surface only**: the on-chain admin
 * instructions it wraps exist (set_fee_bps, set_treasury, … shipped with the
 * #29 program rewrite), but the Squads-SDK-backed bodies are deferred until
 * the multisig vault exists (#30 key ceremony), until then every admin op
 * is executed directly through Squads' own tooling (app.squads.so / CLI),
 * and nothing in the server can meaningfully call this module.
 *
 * Scope (what Squads 3-of-5 controls):
 *   - `setFeeBps`, `setSeekerFeeBps`
 *   - `setTreasury`
 *   - `setApprovalWindow`
 *   - `setDisputeAdmin` (rotation only, routine dispute resolution flows
 *     through the single-key `dispute_admin`, see decision #17)
 *
 * Non-scope: per-request work. No Stage 0 route handler invokes this module.
 * Callers are admin tooling (ops scripts, future admin UI), every operation
 * is rare and deliberate. The functions are async to leave room for the
 * Squads SDK's RPC roundtrips when implementation lands.
 *
 * Reading this file before the vault exists: treat every body as a
 * placeholder that throws 501. The types are stable and safe to import.
 */

import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'

// ---------- value types --------------------------------------------------

/** Base58-encoded Solana pubkey. */
export type SolanaPubkey = string

/** Squads multisig vault PDA, derived from the multisig account + index. */
export type VaultPda = string

/** Squads vault-transaction PDA, uniquely identifies one proposal. */
export type ProposalRef = string

/** Bps with the same [0, 10000] range the Anchor program enforces. */
export type Bps = number

/**
 * Protocol-admin operations the Squads 3-of-5 is authorized to invoke on the
 * Anchor program's `PlatformState`. Discriminated by `kind` so the builder
 * can branch statically. New ops added here must also land on the Anchor
 * program (#29), keep the variants in 1:1 sync.
 */
export type AdminOp =
  | { kind: 'setFeeBps'; bps: Bps }
  | { kind: 'setSeekerFeeBps'; bps: Bps }
  | { kind: 'setTreasury'; pubkey: SolanaPubkey }
  | { kind: 'setApprovalWindow'; seconds: number }
  | { kind: 'setDisputeAdmin'; pubkey: SolanaPubkey }

export interface ProposalStatus {
  ref: ProposalRef
  approved_by: ReadonlyArray<SolanaPubkey>
  threshold: number
  total_signers: number
  /** True iff `approved_by.length >= threshold` AND not yet executed. */
  ready_to_execute: boolean
  executed: boolean
  /** On-chain tx ref of the execute call, if executed. */
  executed_tx_ref: string | null
}

// ---------- client interface ---------------------------------------------

/**
 * Decoupled surface so admin tooling (and tests) can swap in a mock vs the
 * Squads-SDK-backed implementation. Method semantics:
 *
 *   - `proposeAdminOp`: signer #1 creates a vault transaction wrapping the
 *     program admin IX. Returns the proposal ref. Idempotency is the
 *     caller's job, Squads will accept duplicate creates (different PDAs).
 *
 *   - `approveProposal`: vote `Approve` on an existing proposal. Calling
 *     twice with the same signer is a no-op on-chain (Squads dedupes).
 *
 *   - `executeProposal`: invokes `vault_transaction_execute`. Refuses below
 *     threshold (the implementer adds a `MULTISIG_*` ErrorCode family; the
 *     escrow state-machine codes don't apply here). Idempotent,
 *     re-executing an already-executed proposal returns the original tx_ref.
 *
 *   - `getProposalStatus`: read-only state probe; cheap to call from polling.
 */
export interface MultisigClient {
  proposeAdminOp(op: AdminOp): Promise<ProposalRef>
  approveProposal(ref: ProposalRef, signer: SolanaPubkey): Promise<ProposalStatus>
  executeProposal(ref: ProposalRef): Promise<{ tx_ref: string }>
  getProposalStatus(ref: ProposalRef): Promise<ProposalStatus>
}

// ---------- Squads-backed implementation (stub) --------------------------

export interface SquadsClientArgs {
  /** Squads multisig PDA from `MULTISIG_SOLANA_PROTOCOL_ADMIN`. */
  vault: VaultPda
  /** RPC endpoint. */
  rpc_url: string
}

/**
 * Returns a `MultisigClient` whose methods throw 501 until the Squads vault
 * exists (#30) and the SDK-backed implementation lands. The factory itself is
 * safe to call, it returns a typed surface so downstream wiring (admin
 * scripts, DI graphs) can be authored against the interface today.
 */
export function squadsClient(_args: SquadsClientArgs): MultisigClient {
  return {
    async proposeAdminOp(_op) {
      throw notImplemented('proposeAdminOp')
    },
    async approveProposal(_ref, _signer) {
      throw notImplemented('approveProposal')
    },
    async executeProposal(_ref) {
      throw notImplemented('executeProposal')
    },
    async getProposalStatus(_ref) {
      throw notImplemented('getProposalStatus')
    },
  }
}

function notImplemented(name: string): AppError {
  return new AppError(
    501,
    ErrorCode.INTERNAL_ERROR,
    `multisig.${name}: not implemented, Squads-backed client lands once the multisig vault exists (#30)`,
  )
}
