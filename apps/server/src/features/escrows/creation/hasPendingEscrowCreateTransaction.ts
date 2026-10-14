import { and, eq, isNull, type SQLWrapper } from 'drizzle-orm'
import { tx_attempts } from '@tenda/shared/db/schema'
import type { AppDatabase } from '@server/plugins/db'

/**
 * The three clauses that make an attempt "a create awaiting confirmation":
 * ONE spelling, shared by the per-escrow guard below and by the demo draft
 * ring's correlated subquery (features/agent/demo/demoDraftRing, #147), which
 * asks the same question of a whole SELECT at once and so takes the escrow as
 * a column rather than a value. Two copies of these clauses is how one of
 * them would stop counting a failed attempt as settled.
 */
export function pendingCreateAttempt(escrowId: string | SQLWrapper) {
  return and(
    eq(tx_attempts.escrow_id, escrowId),
    eq(tx_attempts.action, 'create'),
    isNull(tx_attempts.confirmed_at),
    isNull(tx_attempts.failed_at),
  )
}

export async function hasPendingEscrowCreateTransaction(
  db: AppDatabase,
  escrowId: string,
): Promise<boolean> {
  const [attempt] = await db
    .select({ id: tx_attempts.id })
    .from(tx_attempts)
    .where(pendingCreateAttempt(escrowId))
    .limit(1)
  return attempt !== undefined
}
