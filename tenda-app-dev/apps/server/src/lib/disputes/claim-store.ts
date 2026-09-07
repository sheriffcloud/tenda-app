/**
 * Claim / release of a dispute (CO7), extracted from the admin route so the
 * conflict-of-interest guard has one home and the route file stays thin.
 *
 * The guard closes the last door: `deriveCaller` already ranks party identity
 * ABOVE the dispute_admin role, so an admin who is a party to an escrow cannot
 * resolve it — but nothing stopped them CLAIMING it, and the claim is what
 * gates proposing a resolution and what makes the mediation thread treat a
 * sender as the neutral mediator. Party membership is read through
 * `isEscrowPartyOrAssignedRow` rather than re-listing the three columns here.
 */
import { and, eq, isNull, or } from 'drizzle-orm'
import { disputes, escrows } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { isEscrowPartyOrAssignedRow } from '@server/lib/escrow-party'
import type { AppDatabase } from '@server/plugins/db'

export interface ClaimArgs {
  disputeId: string
  userId: string
}

export interface ReleaseArgs extends ClaimArgs {
  /** Role from the caller's token; only super_admin may force a release. */
  role: string
}

/**
 * Take a dispute from the open pool. Re-claiming your own is a no-op 200.
 *
 * Two reads bracket the UPDATE on purpose. The first answers "is this caller
 * allowed to mediate at all", which the UPDATE's WHERE cannot express without
 * making its three failure shapes indistinguishable. The UPDATE stays the
 * atomic race arbiter — a rival who claims in between still loses there — and
 * the second read only exists to name WHICH way it lost.
 */
export async function claimDispute(
  db: AppDatabase,
  { disputeId, userId }: ClaimArgs,
): Promise<{ id: string; assigned_to_id: string }> {
  const [subject] = await db
    .select({
      creator_id: escrows.creator_id,
      counterparty_id: escrows.counterparty_id,
      assigned_counterparty_id: escrows.assigned_counterparty_id,
    })
    .from(disputes)
    .innerJoin(escrows, eq(escrows.id, disputes.escrow_id))
    .where(eq(disputes.id, disputeId))
    .limit(1)
  if (subject === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Dispute not found')
  if (isEscrowPartyOrAssignedRow(subject, userId)) {
    throw new AppError(
      403,
      ErrorCode.FORBIDDEN,
      'A party to this escrow cannot mediate its own dispute',
    )
  }

  const [claimed] = await db
    .update(disputes)
    .set({ assigned_to: userId, assigned_at: new Date() })
    .where(
      and(
        eq(disputes.id, disputeId),
        isNull(disputes.resolved_at),
        or(isNull(disputes.assigned_to), eq(disputes.assigned_to, userId)),
      ),
    )
    .returning({ id: disputes.id })
  if (claimed !== undefined) return { id: claimed.id, assigned_to_id: userId }

  const [row] = await db
    .select({ resolved_at: disputes.resolved_at })
    .from(disputes)
    .where(eq(disputes.id, disputeId))
    .limit(1)
  if (row === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Dispute not found')
  if (row.resolved_at !== null) {
    throw new AppError(409, ErrorCode.DISPUTE_RESOLVED, 'Dispute already resolved')
  }
  throw new AppError(409, ErrorCode.DISPUTE_ALREADY_CLAIMED, 'Dispute already claimed by another mediator')
}

/**
 * Return a dispute to the open pool. Idempotent on an unclaimed dispute;
 * claimer-only, except a super_admin who may force-release a colleague's claim.
 * Returns the previous assignee so the caller can emit the audit event.
 */
export async function releaseDispute(
  db: AppDatabase,
  { disputeId, userId, role }: ReleaseArgs,
): Promise<{ id: string; previousAssignee: string | null }> {
  const [row] = await db
    .select({ id: disputes.id, assigned_to: disputes.assigned_to })
    .from(disputes)
    .where(eq(disputes.id, disputeId))
    .limit(1)
  if (row === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Dispute not found')
  if (row.assigned_to === null) return { id: row.id, previousAssignee: null }
  if (row.assigned_to !== userId && role !== 'super_admin') {
    throw new AppError(
      403,
      ErrorCode.FORBIDDEN,
      'Only the claiming mediator (or a super_admin) can release',
    )
  }

  await db
    .update(disputes)
    .set({ assigned_to: null, assigned_at: null })
    .where(eq(disputes.id, row.id))
  return { id: row.id, previousAssignee: row.assigned_to }
}
