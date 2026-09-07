import { and, eq, isNull } from 'drizzle-orm'
import { tx_attempts } from '@tenda/shared/db/schema'
import type { AppDatabase } from '@server/plugins/db'

export async function hasPendingEscrowCreateTransaction(
  db: AppDatabase,
  escrowId: string,
): Promise<boolean> {
  const [attempt] = await db
    .select({ id: tx_attempts.id })
    .from(tx_attempts)
    .where(and(
      eq(tx_attempts.escrow_id, escrowId),
      eq(tx_attempts.action, 'create'),
      isNull(tx_attempts.confirmed_at),
      isNull(tx_attempts.failed_at),
    ))
    .limit(1)
  return attempt !== undefined
}
