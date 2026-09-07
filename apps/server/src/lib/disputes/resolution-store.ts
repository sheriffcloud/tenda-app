/**
 * Data access for dispute-resolution proposals (Issue-3). Pure DB helpers +
 * wire serialization, shared by the dispute-scoped routes (propose / current)
 * and the collection routes (queue / reject) so neither duplicates the query
 * or the Date→ISO mapping.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  disputes,
  dispute_resolutions,
  escrows,
  gig_details,
} from '@tenda/shared/db/schema'
import type {
  DisputeResolution,
  DisputeResolutionRow,
  ResolutionQueueRow,
  ResolutionStatus,
  ResolutionWinner,
} from '@tenda/shared'
import type { AppDatabase } from '@server/plugins/db'

/** Statuses that count as a live proposal (blocks a second one per dispute). */
export const ACTIVE_RESOLUTION_STATUSES = ['pending', 'executing'] as const satisfies
  ReadonlyArray<ResolutionStatus>

export function toResolutionWire(row: DisputeResolutionRow): DisputeResolution {
  return {
    id: row.id,
    dispute_id: row.dispute_id,
    proposed_winner: row.proposed_winner,
    proposed_by: row.proposed_by,
    status: row.status,
    threshold: row.threshold,
    reject_reason: row.reject_reason,
    rejected_by: row.rejected_by,
    resolved_tx_ref: row.resolved_tx_ref,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}

/** The dispute's live (pending|executing) proposal, if one exists. */
export async function getActiveResolution(
  db: AppDatabase,
  disputeId: string,
): Promise<DisputeResolutionRow | undefined> {
  const [row] = await db
    .select()
    .from(dispute_resolutions)
    .where(
      and(
        eq(dispute_resolutions.dispute_id, disputeId),
        inArray(dispute_resolutions.status, [...ACTIVE_RESOLUTION_STATUSES]),
      ),
    )
    .limit(1)
  return row
}

/** The dispute's most-recent proposal in any state (for the detail view). */
export async function getLatestResolution(
  db: AppDatabase,
  disputeId: string,
): Promise<DisputeResolutionRow | undefined> {
  const [row] = await db
    .select()
    .from(dispute_resolutions)
    .where(eq(dispute_resolutions.dispute_id, disputeId))
    .orderBy(desc(dispute_resolutions.created_at))
    .limit(1)
  return row
}

export async function getResolutionById(
  db: AppDatabase,
  id: string,
): Promise<DisputeResolutionRow | undefined> {
  const [row] = await db.select().from(dispute_resolutions).where(eq(dispute_resolutions.id, id)).limit(1)
  return row
}

export interface ResolutionEscrow {
  escrow_id: string
  chain_id: string
  /** Null on escrows that predate contract pinning; see chains/contracts. */
  escrow_contract: string | null
  escrow_status: string
  resolved_at: Date | null
}

/** The escrow a dispute rides on (chain + live status), for the sign flow. */
export async function getResolutionEscrow(
  db: AppDatabase,
  disputeId: string,
): Promise<ResolutionEscrow | undefined> {
  const [row] = await db
    .select({
      escrow_id: disputes.escrow_id,
      chain_id: escrows.chain_id,
      // The contract holding the escrow AND the dispute bond. A dispute is the
      // longest an escrow can stay non-terminal, so it is the likeliest to
      // outlive a redeploy — the resolve tx must go to the contract that took
      // custody, not to whichever is current (open_issues #89).
      escrow_contract: escrows.escrow_contract,
      escrow_status: escrows.status,
      resolved_at: disputes.resolved_at,
    })
    .from(disputes)
    .innerJoin(escrows, eq(escrows.id, disputes.escrow_id))
    .where(eq(disputes.id, disputeId))
    .limit(1)
  return row
}

/** Signing queue: proposals in the given state + escrow context for triage. */
export async function getResolutionQueue(
  db: AppDatabase,
  status: ResolutionStatus,
  limit: number,
  offset: number,
): Promise<{ rows: ResolutionQueueRow[]; total: number }> {
  const base = db
    .select({
      resolution: dispute_resolutions,
      escrow_id: disputes.escrow_id,
      kind: escrows.kind,
      subject_title: gig_details.title,
    })
    .from(dispute_resolutions)
    .innerJoin(disputes, eq(disputes.id, dispute_resolutions.dispute_id))
    .innerJoin(escrows, eq(escrows.id, disputes.escrow_id))
    .leftJoin(gig_details, eq(gig_details.escrow_id, disputes.escrow_id))
    .where(eq(dispute_resolutions.status, status))

  const [rows, count] = await Promise.all([
    base.orderBy(desc(dispute_resolutions.created_at)).limit(limit).offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(dispute_resolutions)
      .where(eq(dispute_resolutions.status, status)),
  ])

  return {
    rows: rows.map((r) => ({
      ...toResolutionWire(r.resolution),
      escrow_id: r.escrow_id,
      kind: r.kind,
      subject_title: r.subject_title,
    })),
    total: count[0].n,
  }
}

/** Narrow an untrusted winner value without a cast (project rule). */
export function narrowWinner(v: unknown): ResolutionWinner | null {
  if (v === 'creator' || v === 'counterparty' || v === 'split') return v
  return null
}
