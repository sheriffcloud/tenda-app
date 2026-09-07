/**
 * Chain-cursor persistence, shared by every polling listener (Solana slots,
 * EVM block numbers — `chain_cursors.last_block` holds whichever ordinal the
 * chain's listener advances). Keyed by chain_id, so listeners never contend:
 * one row per chain, upserted in place.
 *
 * Extracted from chains/solana/listener-polling when the EVM listener became
 * the second consumer; webhooks stay push-based and dedup via job ids, they
 * never touch cursors.
 */

import { eq } from 'drizzle-orm'
import { chain_cursors } from '@tenda/shared/db/schema/ops'
import type { AppDatabase } from '@server/plugins/db'
import type { ChainId } from '@server/chains/types'

export interface CursorStore {
  /** Last processed slot/block for the chain; 0 when no cursor exists yet. */
  getCursor(chain_id: ChainId): Promise<number>
  setCursor(chain_id: ChainId, ordinal: number): Promise<void>
}

export function drizzleCursorStore(db: AppDatabase): CursorStore {
  return {
    async getCursor(chain_id) {
      const rows = await db
        .select({ last_block: chain_cursors.last_block })
        .from(chain_cursors)
        .where(eq(chain_cursors.chain_id, chain_id))
        .limit(1)
      return rows[0]?.last_block ?? 0
    },
    async setCursor(chain_id, ordinal) {
      await db
        .insert(chain_cursors)
        .values({ chain_id, last_block: ordinal, last_processed_at: new Date() })
        .onConflictDoUpdate({
          target: chain_cursors.chain_id,
          set: { last_block: ordinal, last_processed_at: new Date() },
        })
    },
  }
}
