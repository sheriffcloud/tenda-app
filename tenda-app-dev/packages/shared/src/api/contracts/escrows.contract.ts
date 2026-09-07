/**
 * v2 escrow surface — /v1/escrows + /v1/escrows/:id/* + the client-ping.
 * Mirrors the server routes added in Stage 0 (#27, #62). The legacy
 * gigs/exchange transition contracts coexist until the cutover (#34)
 * deletes them.
 */

import type { Endpoint } from '../endpoint'
import type { FundEscrowResponse } from './relay.contract'
import type { AssignWorkerBody, ReleaseAssignmentResponse } from '../../types/application'
import type { EscrowTxType } from '../../constants/escrow'
import type { DataProofType, FileProofType, ProofType } from '../../constants/proofs'
import type { ProofPayload } from '../../constants/proof-payloads'
import type { EscrowProof } from '../../types/escrow'
import type { Review, ReviewInput } from '../../types/review'
import type { DisputeMessage, DisputeThreadResponse, SendDisputeMessageBody } from '../../types/dispute'

// ---------- wire types ------------------------------------------------------

/** ERC-4337 UserOperation (hex-string fields for u256 safety). Stage 3+. */
export interface WireUserOperation {
  sender: string
  nonce: string
  init_code: string
  call_data: string
  call_gas_limit: string
  verification_gas_limit: string
  pre_verification_gas: string
  max_fee_per_gas: string
  max_priority_fee_per_gas: string
  paymaster_and_data: string
  signature: string
}

/**
 * Unsigned transaction returned by every escrow action route. The client
 * signs and broadcasts, then reports the tx_ref via the client-ping.
 */
export type UnsignedTx =
  | {
      kind: 'solana-tx'
      /** base64-serialized unsigned versioned transaction. */
      tx_base64: string
      recent_blockhash: string
      last_valid_block_height: number
      /**
       * The wallet this tx must be signed by — it is baked in as fee-payer +
       * signer account. For transitions on an existing escrow it is the
       * chain-bound party address; for create/public-accept it is the
       * client-requested (validated) wallet, defaulting to the primary.
       */
      signer_address?: string
    }
  | {
      kind: 'evm-tx'
      to: string
      data: string
      value: string
      gas_limit?: string
      /** CELO gas abstraction: pay gas in this ERC-20 (cUSD). */
      fee_currency?: string
      /** ERC-20 prerequisite the wallet must satisfy BEFORE broadcasting:
       *  allowance(owner → spender) ≥ amount_raw, topped up via approve()
       *  if short. Absent for native assets and for permit-built calls
       *  (there the allowance rides the tx itself). */
      approval?: { token: string; spender: string; amount_raw: string }
      /**
       * The account this call must be sent FROM (`msg.sender`): the
       * chain-bound party address for transitions on an existing escrow, the
       * requested/primary wallet for create. Absent when the server could not
       * read the binding (RPC failure falls open) — the client then behaves
       * as before this field existed.
       */
      signer_address?: string
    }
  | {
      kind: 'evm-userop'
      user_op: WireUserOperation
      entry_point: string
      paymaster_url?: string
      /** The userop sender — same meaning as on evm-tx. */
      signer_address?: string
    }

/**
 * EIP-2612 signature over the exact transfer an action needs — obtained by
 * signing the payload from POST /v1/blockchain/permit-payload with
 * eth_signTypedData_v4. ERC-20 assets flagged `supports_permit` only; the
 * server encodes the *WithPermit contract call when this rides the body.
 */
export interface PermitSignatureBody {
  /** Base-unit value the owner signed — must cover the amount/bond exactly. */
  value_raw: string
  deadline_unix: number
  /** 65-byte 0x-hex signature; the server splits v/r/s. */
  signature: string
}

export interface CreateEscrowApiBody {
  /** Stable across retries so an uncertain response cannot create a second draft. */
  creation_operation_id: string
  kind: 'gig' | 'exchange'
  /** CAIP-2 chain id, e.g. 'solana:devnet'. */
  chain_id: string
  /** Asset registry id, e.g. 'SOL', 'USDC_SOL'. */
  asset: string
  amount_raw: string
  /** How long the listing stays open for a counterparty to accept. The server
   *  derives the absolute deadline from this when it BUILDS the create tx (#41). */
  accept_window_seconds: number
  completion_duration_seconds: number
  dispute_bond_raw?: string
  assigned_counterparty_id?: string
  /**
   * Approval mode: the poster assigns from applications instead of the gig
   * being first-come, first-served. Gigs only, and mutually exclusive with
   * `assigned_counterparty_id` — both contracts reject the pair, so the server
   * refuses it before the transaction is built.
   */
  requires_approval?: boolean
  /** EIP-2612 path: sign first, then create — the server returns the
   *  createEscrowWithPermit call instead of createEscrow + approval hint. */
  permit?: PermitSignatureBody
  /**
   * The wallet the client intends to sign with — must be one of the caller's
   * verified linked wallets on the escrow's chain (422 otherwise). Absent →
   * the primary linked wallet, the pre-existing behaviour. When a permit
   * rides the body its owner must be this same account.
   */
  signer_address?: string
}

/**
 * Optional body for transitions whose signer is not yet chain-bound (accept
 * of a public escrow, publish of a draft): the wallet the client intends to
 * sign with. Same validation and default as CreateEscrowApiBody's field. On
 * a BOUND transition the server compares it against the chain-bound address
 * and refuses a mismatch with ESCROW_WRONG_WALLET + details.required_address
 * — which is what lets a client re-target BEFORE building a permit.
 */
export interface SignerPreferenceBody {
  signer_address?: string
}

export interface CreateEscrowApiResponse {
  /** Server-generated escrow id — the on-chain escrow_id seed. */
  escrow_id: string
  unsigned: UnsignedTx
}

export interface EscrowActionResponse {
  unsigned: UnsignedTx
}

export interface SubmitEscrowProofBody {
  /** 32-byte digest: base58 (Solana) or 0x-hex (EVM). */
  proof_hash: string
}

/**
 * One proof in an upload batch, by class: a FILE proof is a Cloudinary url
 * under the uploader's folder, a DATA proof (geotag/text/structured) is a
 * payload the server shape-checks and — where the gig declared params —
 * verifies. Exactly one of the two per proof; the server refuses a mix.
 */
export type EscrowProofUpload =
  | { type: FileProofType; url: string }
  | { type: DataProofType; payload: ProofPayload }

/** Off-chain evidence batch — see EscrowProofUpload for the per-class shape. */
export interface AddEscrowProofsBody {
  proofs: EscrowProofUpload[]
}

export interface DisputeEscrowApiBody {
  bond_raw: string
  /** Triage reason for the admin dispute queue (validated 10–2000 chars). */
  reason: string
  /** EIP-2612 path for the ERC-20 bond (disputeEscrowWithPermit). */
  permit?: PermitSignatureBody
  /** See SignerPreferenceBody — dispute is bound, so a mismatch with the
   *  raiser's chain-bound address is refused with the required address named
   *  (the permit's owner must match the eventual sender). */
  signer_address?: string
}

export interface ResolveEscrowApiBody {
  winner: 'creator' | 'counterparty' | 'split'
}

export interface ClientPingBody {
  tx_ref: string
  action: EscrowTxType
  chain_id: string
  escrow_id?: string
}

export interface ClientPingResponse {
  status: 'queued'
  recorded: boolean
  enqueued: boolean
}

// ---------- contract ---------------------------------------------------------

type IdParam = { id: string }

export interface EscrowsContract {
  create: Endpoint<'POST', undefined, CreateEscrowApiBody, undefined, CreateEscrowApiResponse>
  /** Rebuild the unsigned create tx for an owned draft (publish path for
   *  server-opened offramp drafts + signing-declined retries). */
  buildCreate: Endpoint<'POST', IdParam, SignerPreferenceBody | undefined, undefined, CreateEscrowApiResponse>
  /**
   * Relayed funding of an owned draft (x402): without an X-PAYMENT header the
   * answer is 402 + RelayPaymentRequired; with one the server relays the
   * signed artifact, pays the gas, and answers 202 (relay.contract.ts).
   *
   * The escrow PRIMITIVE, not the agent surface: web/mobile do not call it and
   * agents use the one-shot `/v1/agent/…` route (#19), which composes the same
   * relay in-process. Declared here so the route table stays honest; kept for
   * a possible gasless human flow (decision 2026-08-28, see
   * docs/agent_escrow_funding_relayer.md).
   */
  fund: Endpoint<'POST', IdParam, SignerPreferenceBody | undefined, undefined, FundEscrowResponse>
  accept: Endpoint<'POST', IdParam, SignerPreferenceBody | undefined, undefined, EscrowActionResponse>
  decline: Endpoint<'POST', IdParam, undefined, undefined, EscrowActionResponse>
  submit: Endpoint<'POST', IdParam, SubmitEscrowProofBody, undefined, EscrowActionResponse>
  approve: Endpoint<'POST', IdParam, undefined, undefined, EscrowActionResponse>
  claim: Endpoint<'POST', IdParam, undefined, undefined, EscrowActionResponse>
  cancel: Endpoint<'POST', IdParam, undefined, undefined, EscrowActionResponse>
  /** Covers refund_expired (open) AND reclaim_abandoned (accepted) — server picks by status. */
  refund: Endpoint<'POST', IdParam, undefined, undefined, EscrowActionResponse>
  dispute: Endpoint<'POST', IdParam, DisputeEscrowApiBody, undefined, EscrowActionResponse>
  /** CO7 mediation thread — one shared conversation per dispute (same path, GET/POST). */
  disputeMessages: Endpoint<'GET', IdParam, undefined, { after?: string }, DisputeThreadResponse>
  sendDisputeMessage: Endpoint<'POST', IdParam, SendDisputeMessageBody, undefined, DisputeMessage>
  resolve: Endpoint<'POST', IdParam, ResolveEscrowApiBody, undefined, EscrowActionResponse>
  /** Off-chain: draft discard, evidence files, post-completion reviews. */
  delete: Endpoint<'DELETE', IdParam, undefined, undefined, { deleted: true }>
  proofs: Endpoint<'GET', IdParam, undefined, undefined, EscrowProof[]>
  addProofs: Endpoint<'POST', IdParam, AddEscrowProofsBody, undefined, EscrowProof[]>
  review: Endpoint<'POST', IdParam, ReviewInput, undefined, Review>
  /** Approval mode: the creator picks an applicant and signs for both sides. */
  assign: Endpoint<'POST', IdParam, AssignWorkerBody, undefined, EscrowActionResponse>
  /** Approval mode: the creator withdraws an assignment inside the window. */
  unassign: Endpoint<'POST', IdParam, undefined, undefined, EscrowActionResponse>
  /**
   * The assigned worker says they are not available. OFF-CHAIN: they signed
   * nothing to be assigned, so they sign nothing to step back — this records
   * the signal, suppresses the abandonment strike and prompts the poster to
   * unassign. It does not move the escrow, which only the creator can do.
   */
  release: Endpoint<'POST', IdParam, undefined, undefined, ReleaseAssignmentResponse>
}
