/**
 * Agent API v1 write surface (#19) — the two routes an autonomous agent
 * needs beyond the public gig reads: a wallet-born registration and the
 * ONE-SHOT task post. Everything else (draft, listing, moderation, the x402
 * quote and relay, publishing) happens inside that one call, so an agent
 * with a key and HTTP — no RPC, no gas — can hire.
 *
 * The 402 half is the x402 envelope of relay.contract.ts (the terms are the
 * escrow primitive's, unchanged); this contract adds `task_id` so the agent
 * can correlate a quote with the task it will fund, and the 201 shape.
 */
import type { Endpoint } from '../endpoint'
import type { AuthResponse } from '../../types/user'
import type { CreateGigDetailsBody } from '../../types/gig'
import type { LinkWalletBody } from './auth.contract'
import type { RelayPaymentRequired } from './relay.contract'

/**
 * Register (or sign back in as) an agent by proving control of its wallet —
 * the same nonce-signed message the human wallet login uses. `name` is the
 * agent's public display name; it has no phone or email to verify, which is
 * exactly why it is flagged `is_agent` on every surface.
 */
export interface AgentRegisterBody extends LinkWalletBody {
  name: string
  /** ISO-3166 alpha-2; optional, like a human sign-up's bootstrap country. */
  country?: string
}

export interface AgentRegisterResponse extends AuthResponse {
  /** False when the wallet already belonged to this agent — a sign-in, not a second account. */
  is_new: boolean
}

/**
 * The one-shot body: the ESCROW terms (what POST /v1/escrows takes, minus
 * `kind` — always a gig — and minus `permit`, which the relay replaces) plus
 * the LISTING fields (what POST /v1/gigs takes, minus `escrow_id` — the
 * server mints it). `creation_operation_id` is REQUIRED here: the 402 → resend
 * round trip must land on the same draft, and this is what makes it.
 */
export interface AgentTaskBody extends Omit<CreateGigDetailsBody, 'escrow_id'> {
  creation_operation_id: string
  chain_id: string
  asset: string
  amount_raw: string
  /** How long the listing stays open for a worker to accept. The server derives
   *  the absolute deadline from this when it BUILDS the create tx (#41). */
  accept_window_seconds: number
  completion_duration_seconds: number
  dispute_bond_raw?: string
  /** Direct invite: the one worker who may accept (they need a wallet on the chain — 422 otherwise). */
  assigned_counterparty_id?: string
  /** Approval mode: workers apply, the agent assigns; exclusive with a direct invite. */
  requires_approval?: boolean
  /** The agent's signing wallet when it has linked more than one; absent → primary. */
  signer_address?: string
}

/** The 402: x402 terms bound to the draft the call just created (or found). */
export interface AgentTaskPaymentRequired extends RelayPaymentRequired {
  /** The task's id — also the gig id, readable at GET /v1/gigs/{id} with the bearer. */
  task_id: string
}

/**
 * The 201: the artifact was relayed. The task is a DRAFT until the chain
 * confirms the create (`status` here is that draft); poll GET /v1/gigs/{id}
 * with the bearer — it answers the creator's own draft — until `status` is
 * `open`, at which point the listing is public.
 */
export interface AgentTaskCreated {
  task_id: string
  tx_ref: string
  status: 'draft'
  /** From the client-ping intake: recorded = the attempt row exists; enqueued = verify-tx queued. */
  recorded: boolean
  enqueued: boolean
}

export interface AgentContract {
  register: Endpoint<'POST', undefined, AgentRegisterBody, undefined, AgentRegisterResponse>
  /** 402 AgentTaskPaymentRequired without X-PAYMENT; 201 AgentTaskCreated with it. */
  tasks: Endpoint<'POST', undefined, AgentTaskBody, undefined, AgentTaskCreated>
}
