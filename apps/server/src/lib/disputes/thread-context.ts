/**
 * Builds the read-only escrow context shown atop the mediation thread (party
 * + mediator view). Pure data assembly (no HTTP), so it is unit-testable and
 * reused by GET /v1/escrows/:id/dispute/messages. Shares the creator-first
 * party derivation with the admin dossier via lib/disputes/parties.
 */
import { eq, inArray } from 'drizzle-orm'
import { gig_details, users } from '@tenda/shared/db/schema'
import type { DisputeThreadContext, EscrowKind, EscrowStatus, ResolutionWinner } from '@tenda/shared'
import type { AppDatabase } from '@server/plugins/db'
import { deriveDisputeParties, partyIdsOf, type PartyEscrow } from './parties'

/** Escrow fields the thread context needs (a superset of PartyEscrow). */
export interface ThreadContextEscrow extends PartyEscrow {
  id: string
  kind: EscrowKind
  status: EscrowStatus
  chain_id: string
  asset: string
  amount_raw: string
}

/** Dispute triage fields the thread context needs. */
export interface ThreadContextDispute {
  raised_by: string
  reason: string
  created_at: Date
  winner: ResolutionWinner | null
  resolved_at: Date | null
}

export async function buildDisputeThreadContext(
  db: AppDatabase,
  escrow: ThreadContextEscrow,
  dispute: ThreadContextDispute,
): Promise<DisputeThreadContext> {
  const partyIds = partyIdsOf(escrow)
  const [identities, gigRow] = await Promise.all([
    db
      .select({ id: users.id, first_name: users.first_name, last_name: users.last_name })
      .from(users)
      .where(inArray(users.id, partyIds)),
    db
      .select({ title: gig_details.title })
      .from(gig_details)
      .where(eq(gig_details.escrow_id, escrow.id))
      .limit(1),
  ])

  return {
    kind: escrow.kind,
    status: escrow.status,
    chain_id: escrow.chain_id,
    asset: escrow.asset,
    amount_raw: escrow.amount_raw,
    subject_title: gigRow[0]?.title ?? null,
    parties: deriveDisputeParties(escrow, dispute.raised_by, identities),
    reason: dispute.reason,
    raised_at: dispute.created_at.toISOString(),
    winner: dispute.winner,
    resolved_at: dispute.resolved_at === null ? null : dispute.resolved_at.toISOString(),
  }
}
