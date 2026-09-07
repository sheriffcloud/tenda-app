/**
 * Shared authorization for the CO7 dispute-mediation thread. Both the thread
 * message routes AND the scoped upload-signature route must answer the same
 * question — "may this caller read/write this escrow's dispute thread?" — so
 * the check lives here once instead of being duplicated per route.
 *
 * Access = a party to the escrow (creator, counterparty, or assigned
 * counterparty — `isEscrowPartyOrAssignedRow`, the same predicate the detail
 * routes scope their private fields with) OR an admin holding the
 * `disputes.mediate` permission.
 */
import { eq } from 'drizzle-orm'
import { disputes } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { hasPermission } from '@server/lib/guards'
import { loadEscrowOr404, type EscrowRow } from '@server/lib/escrow-routes'
import { isEscrowPartyOrAssignedRow } from '@server/lib/escrow-party'
import type { AppDatabase } from '@server/plugins/db'

export type DisputeRow = typeof disputes.$inferSelect

export interface DisputeThreadAccess {
  escrow: EscrowRow
  dispute: DisputeRow
  /** True for the two disputants; false for a mediating admin. */
  isParty: boolean
}

/**
 * Load the escrow + its dispute and authorize the caller for thread access.
 * Throws 404 if the escrow or dispute is missing, 403 if the caller is
 * neither a party nor a permitted mediator.
 */
export async function assertDisputeThreadAccess(
  db: AppDatabase,
  escrowId: string,
  user: { id: string; role: string },
): Promise<DisputeThreadAccess> {
  const escrow = await loadEscrowOr404(db, escrowId)

  const [dispute] = await db
    .select()
    .from(disputes)
    .where(eq(disputes.escrow_id, escrow.id))
    .limit(1)
  if (dispute === undefined) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'No dispute on this escrow')
  }

  const isParty = isEscrowPartyOrAssignedRow(escrow, user.id)
  if (!isParty && !hasPermission(user.role, 'disputes.mediate')) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'No access to this dispute thread')
  }

  return { escrow, dispute, isParty }
}
