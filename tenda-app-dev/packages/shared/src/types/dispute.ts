/**
 * CO7 dispute-mediation thread types — shared by the server routes and the
 * mobile party UI (admin frontend later). One thread per dispute; both
 * parties and the claiming admin read/write the same messages.
 */
import type { InferSelectModel } from 'drizzle-orm'
import type { dispute_messages, dispute_resolutions } from '../db/schema'
import type { EscrowKind, EscrowStatus } from './escrow'
import type { AttachmentFields, AttachmentInput } from './attachment'
import type { DossierParty } from './dossier'
import type { PartyRole } from '../utils/parties'
import type { UnsignedTx } from '../api/contracts/escrows.contract'

export type DisputeMessageRow = InferSelectModel<typeof dispute_messages>
export type DisputeResolutionRow = InferSelectModel<typeof dispute_resolutions>

/** On-chain outcome — same vocabulary as the winner enum and resolve flow. */
export type ResolutionWinner = 'creator' | 'counterparty' | 'split'
export type ResolutionStatus = 'pending' | 'executing' | 'confirmed' | 'rejected'

/** Wire shape of a resolution proposal (Date → ISO string). */
export interface DisputeResolution {
  id: string
  dispute_id: string
  proposed_winner: ResolutionWinner
  proposed_by: string
  status: ResolutionStatus
  threshold: number
  reject_reason: string | null
  rejected_by: string | null
  resolved_tx_ref: string | null
  created_at: string
  updated_at: string
}

/**
 * A proposal enriched with the sign context (chain + configured authority) so
 * the admin panel can reactively gate the sign button — show the connected
 * wallet, and only enable signing once it matches this chain's authority —
 * without the side-effecting execute-build. Returned by the admin resolution
 * read (GET /v1/admin/disputes/:id/resolution).
 */
export interface AdminResolutionView extends DisputeResolution {
  chain_id: string
  /** Configured dispute authority for the chain; null when unconfigured. */
  dispute_admin_authority: string | null
}

/** A pending proposal in the signing queue, with escrow context for triage. */
export interface ResolutionQueueRow extends DisputeResolution {
  escrow_id: string
  kind: EscrowKind
  /** gig_details.title for gigs; null for exchanges. */
  subject_title: string | null
}

/** POST /v1/admin/disputes/:id/resolution */
export interface ProposeResolutionBody {
  winner: ResolutionWinner
}

/** POST /v1/admin/resolutions/:id/reject */
export interface RejectResolutionBody {
  reason: string
}

/**
 * POST /v1/admin/resolutions/:id/execute-build — the unsigned on-chain
 * resolve tx for the STORED proposed_winner, plus the fields the signer
 * needs to broadcast + client-ping without a second round-trip.
 */
export interface ResolutionExecuteBuild {
  resolution_id: string
  escrow_id: string
  chain_id: string
  proposed_winner: ResolutionWinner
  /**
   * The configured on-chain dispute authority for this chain (the wallet the
   * signer must connect); null when unconfigured, so the client skips the
   * pre-flight check rather than blocking.
   */
  dispute_admin_authority: string | null
  unsigned: UnsignedTx
}

/** Wire shape (Date → ISO string). */
export interface DisputeMessage extends AttachmentFields {
  id: string
  dispute_id: string
  sender_id: string
  body: string
  created_at: string
}

/** Participant read cursor — lets clients render seen/unseen state. */
export interface DisputeReadCursor {
  user_id: string
  last_read_at: string
}

/**
 * Read-only escrow context shown atop the mediation thread so a party (or the
 * mediator) can see WHO they are disputing with and WHAT the escrow was
 * without leaving the thread. Reuses the dossier party shape and the
 * structural creator|counterparty vocabulary. Built only on the full thread
 * load — the `?after=` tail polls omit it (the client keeps the first copy).
 */
export interface DisputeThreadContext {
  kind: EscrowKind
  status: EscrowStatus
  chain_id: string
  asset: string
  amount_raw: string
  /** gig_details.title for gigs; null for exchanges (client derives the label). */
  subject_title: string | null
  /** Creator-first; counterparty omitted only if the escrow was never assigned. */
  parties: DossierParty[]
  /** Dispute triage reason (the raiser's statement). */
  reason: string
  raised_at: string | null
  /** Resolved outcome in structural vocabulary; null while unresolved. */
  winner: ResolutionWinner | null
  resolved_at: string | null
}

/** GET /v1/escrows/:id/dispute/messages */
export interface DisputeThreadResponse {
  dispute_id: string
  escrow_id: string
  /** Mediating admin (claim-based); null while unclaimed. */
  assigned_to_id: string | null
  /** Resolved disputes keep a readable, frozen thread. */
  read_only: boolean
  /** Escrow + party context; present on the full load, null on `?after=` polls. */
  context: DisputeThreadContext | null
  messages: DisputeMessage[]
  reads: DisputeReadCursor[]
}

/** POST /v1/escrows/:id/dispute/messages */
export interface SendDisputeMessageBody extends AttachmentInput {
  body: string
}

// ─── "My Disputes" (party-facing list) ───────────────────────────────────────

export type MyDisputeStatus = 'open' | 'resolved'

/** GET /v1/disputes query. Omit `status` for the caller's full history. */
export type MyDisputesQuery = {
  status?: MyDisputeStatus
  limit?: number
  offset?: number
}

/**
 * One row in the caller's "My Disputes" list (GET /v1/disputes) — enough to
 * render the row and deep-link into /dispute/:escrow_id. `my_role` and
 * `counterparty_name` are resolved relative to the caller.
 */
export interface MyDisputeRow {
  dispute_id: string
  escrow_id: string
  kind: EscrowKind
  /** gig_details.title for gigs; null for exchanges. */
  subject_title: string | null
  /** Escrow status ('disputed' while open; terminal once resolved). */
  status: EscrowStatus
  /** The caller's structural role in this escrow. */
  my_role: PartyRole
  /** The other party's display name; null when they have no profile name. */
  counterparty_name: string | null
  reason: string
  raised_at: string | null
  /** Resolved outcome in structural vocabulary; null while open. */
  winner: ResolutionWinner | null
  resolved_at: string | null
  /** True when the caller is the one who raised the dispute. */
  raised_by_me: boolean
}
