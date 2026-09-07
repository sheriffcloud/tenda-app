/**
 * Admin escrow dossier — the full mediation context behind a dispute:
 * both parties (structural creator/counterparty identity), amounts, the
 * kind-specific detail record, submitted proofs, and the on-chain
 * transaction timeline. Returned by GET /v1/admin/escrows/:id/dossier and
 * consumed by the dispute detail panel. Wire shape only (Date → ISO string).
 */
import type { EscrowKind, EscrowStatus } from './escrow'
import type { PartyRole } from '../utils/parties'
import type { ProofType } from '../constants/proofs'

/** A party to the escrow. `role` is the structural, kind-agnostic identity. */
export interface DossierParty {
  role: PartyRole
  user_id: string
  first_name: string | null
  last_name: string | null
  /** True when this party raised the dispute. */
  raised_dispute: boolean
}

export interface DossierProof {
  id: string
  url: string
  type: ProofType
  uploaded_at: string
}

export interface DossierTransaction {
  id: string
  type: string
  tx_ref: string
  amount_raw: string | null
  platform_fee_raw: string | null
  /** Resolve rows only: the creator's principal share. */
  creator_payout_raw: string | null
  actor_id: string | null
  created_at: string
}

/**
 * The gig as a mediator reads it: the `gig_details` listing PLUS the escrow's
 * acceptance mode, which is meaningless for an exchange and belongs with the
 * gig's terms. Deadlines are not here — those live on the escrow proper.
 */
export interface DossierGigDetails {
  title: string
  description: string | null
  /** Stored as free text (constrained to GIG_CATEGORIES at creation). */
  category: string
  country: string | null
  city: string | null
  remote: boolean
  /**
   * Evidence the poster required at listing time. A mediator judging "the
   * worker never sent what I asked for" cannot rule on `proofs` alone — they
   * need the bar that was set, and it is immutable once the gig leaves draft.
   */
  proof_requirements: ProofType[]
  /**
   * Approval mode: the poster assigned this worker rather than the worker
   * accepting. Sourced from the ESCROW, not gig_details — it is carried here
   * because it is meaningless for an exchange and a mediator reads it as part
   * of the gig's terms.
   */
  requires_approval: boolean
  /**
   * Whether the assigned worker had a live application when the assignment
   * landed. THE question behind "did they choose this gig, or were they put in
   * it" — and the same flag that decides whether an abandonment strike is
   * fair, so a mediator must be able to see what the rule saw.
   */
  assigned_from_application: boolean
  /** How many workers applied, in any state. Context for how contested it was. */
  applicant_count: number
}

/** exchange_details projection; payment_proof_url is the fiat evidence. */
export interface DossierExchangeDetails {
  fiat_amount: string
  fiat_currency: string
  rate: string
  payment_window_seconds: number
  payment_proof_url: string | null
}

export interface AdminEscrowDossier {
  escrow_id: string
  kind: EscrowKind
  status: EscrowStatus
  chain_id: string
  asset: string
  amount_raw: string
  dispute_bond_raw: string
  created_at: string
  /** Ordered creator-first; counterparty omitted when never accepted. */
  parties: DossierParty[]
  /** Exactly one of gig/exchange is non-null, matching `kind`. */
  gig: DossierGigDetails | null
  exchange: DossierExchangeDetails | null
  proofs: DossierProof[]
  /** Oldest-first — renders as a status timeline. */
  transactions: DossierTransaction[]
}
