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
  /**
   * History scan position (#35), walking forward toward `getCursor`. `null`
   * means "not initialised" — the EVM tick's cue to adopt whatever single
   * cursor the deployment already had. NOT a 0 sentinel: 0 is a legitimate
   * position (a chain whose history starts at block 1 has scanned nothing when
   * it stores `1 - 1`), and collapsing the two meanings made a stalled history
   * scan look like a fresh row on the next tick. Solana's listener does not use
   * it — one cursor is enough there, its slots are not scanned in ranges.
   */
  getBackfillCursor(chain_id: ChainId): Promise<number | null>
  setBackfillCursor(chain_id: ChainId, ordinal: number): Promise<void>
  /**
   * Write BOTH positions in one statement, for the one-time adoption that
   * initialises the history cursor.
   *
   * Atomic because adoption is the only moment the two disagree about what has
   * been scanned: it moves live to head AND records where history must resume.
   * Split across two upserts, a process that died between them left live at
   * head with history still uninitialised — and the next boot then adopted
   * live, declaring every unscanned block covered. MEASURED on the pre-#35
   * upgrade path: 400,000 blocks reported as `backfill_remaining: 0`.
   */
  initCursors(chain_id: ChainId, positions: { live: number; backfill: number }): Promise<void>
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
    async getBackfillCursor(chain_id) {
      const rows = await db
        .select({ backfill_block: chain_cursors.backfill_block })
        .from(chain_cursors)
        .where(eq(chain_cursors.chain_id, chain_id))
        .limit(1)
      // No row and a NULL column are the same answer — neither has been
      // initialised — so `?? null` covers both without inventing a position.
      return rows[0]?.backfill_block ?? null
    },
    async setBackfillCursor(chain_id, ordinal) {
      await db
        .insert(chain_cursors)
        .values({ chain_id, backfill_block: ordinal, last_processed_at: new Date() })
        .onConflictDoUpdate({
          target: chain_cursors.chain_id,
          set: { backfill_block: ordinal, last_processed_at: new Date() },
        })
    },
    async initCursors(chain_id, positions) {
      await db
        .insert(chain_cursors)
        .values({
          chain_id,
          last_block: positions.live,
          backfill_block: positions.backfill,
          last_processed_at: new Date(),
        })
        .onConflictDoUpdate({
          target: chain_cursors.chain_id,
          set: {
            last_block: positions.live,
            backfill_block: positions.backfill,
            last_processed_at: new Date(),
          },
        })
    },
  }
}
