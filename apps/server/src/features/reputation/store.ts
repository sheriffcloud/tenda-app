/**
 * Drizzle implementation of the reputation store seam.
 *
 * Event ordering note: the verify-tx pipeline stamps `disputes.winner`
 * BEFORE republishing `escrow.dispute_resolved`, so `getEscrowContext`
 * can read the winner from the dispute row when the reputation consumer
 * runs.
 */

import { and, eq, gte, sql } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema/escrow'
import { disputes } from '@tenda/shared/db/schema/governance'
import {
  standing_events,
  user_standing,
  type StandingEventKind,
} from '@tenda/shared/db/schema/reputation'
import type { AppDatabase } from '@server/plugins/db'
import type { ReputationStore } from '@server/features/reputation/service'

const COUNTER_BY_KIND: Record<StandingEventKind, keyof typeof COUNTER_COLUMNS | null> = {
  completed: 'completed_count',
  abandoned: 'abandoned_count',
  ghosted_approval: 'ghosted_count',
  disputed_won: 'disputed_won_count',
  disputed_lost: 'disputed_lost_count',
  fraud_confirmed: 'fraud_confirmed_count',
  // Neutral bookkeeping kinds, recorded as events, no lifetime counter.
  declined: null,
  cancelled: null,
}

const COUNTER_COLUMNS = {
  completed_count: user_standing.completed_count,
  abandoned_count: user_standing.abandoned_count,
  ghosted_count: user_standing.ghosted_count,
  disputed_won_count: user_standing.disputed_won_count,
  disputed_lost_count: user_standing.disputed_lost_count,
  fraud_confirmed_count: user_standing.fraud_confirmed_count,
} as const

export function drizzleReputationStore(db: AppDatabase): ReputationStore {
  return {
    async getEscrowContext(escrow_id) {
      const rows = await db
        .select({
          creator_id: escrows.creator_id,
          counterparty_id: escrows.counterparty_id,
          winner: disputes.winner,
          raised_by: disputes.raised_by,
          requires_approval: escrows.requires_approval,
          assigned_from_application: escrows.assigned_from_application,
          assignment_released_at: escrows.assignment_released_at,
        })
        .from(escrows)
        .leftJoin(disputes, eq(disputes.escrow_id, escrows.id))
        .where(eq(escrows.id, escrow_id))
        .limit(1)
      const row = rows[0]
      if (row === undefined) return null
      return {
        parties: { creator_id: row.creator_id, counterparty_id: row.counterparty_id },
        requires_approval: row.requires_approval,
        assigned_from_application: row.assigned_from_application,
        assignment_released: row.assignment_released_at !== null,
        ...(row.winner !== null && row.raised_by !== null
          ? { dispute: { winner: row.winner, raised_by: row.raised_by } }
          : {}),
      }
    },

    async insertStandingEvent(e) {
      await db.insert(standing_events).values(e)
    },

    async bumpCounter(user_id, kind) {
      const counter = COUNTER_BY_KIND[kind]
      if (counter === null) {
        // Ensure the standing row exists even for neutral kinds.
        await db.insert(user_standing).values({ user_id }).onConflictDoNothing({
          target: user_standing.user_id,
        })
        return
      }
      const column = COUNTER_COLUMNS[counter]
      await db
        .insert(user_standing)
        .values({ user_id, [counter]: 1 })
        .onConflictDoUpdate({
          target: user_standing.user_id,
          set: { [counter]: sql`${column} + 1` },
        })
    },

    async countInWindow(user_id, kind, since) {
      const rows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(standing_events)
        .where(
          and(
            eq(standing_events.user_id, user_id),
            eq(standing_events.kind, kind),
            gte(standing_events.recorded_at, since),
          ),
        )
      return rows[0]?.n ?? 0
    },

    async getStanding(user_id) {
      const rows = await db
        .select({
          completed_count: user_standing.completed_count,
          abandoned_count: user_standing.abandoned_count,
          ghosted_count: user_standing.ghosted_count,
          disputed_won_count: user_standing.disputed_won_count,
          disputed_lost_count: user_standing.disputed_lost_count,
          fraud_confirmed_count: user_standing.fraud_confirmed_count,
          restriction_until: user_standing.restriction_until,
          restriction_kind: user_standing.restriction_kind,
          restriction_reason: user_standing.restriction_reason,
        })
        .from(user_standing)
        .where(eq(user_standing.user_id, user_id))
        .limit(1)
      return rows[0] ?? null
    },

    async setRestriction(user_id, r) {
      await db
        .insert(user_standing)
        .values({
          user_id,
          restriction_kind: r.kind,
          restriction_until: r.until,
          restriction_reason: r.reason,
        })
        .onConflictDoUpdate({
          target: user_standing.user_id,
          set: {
            restriction_kind: r.kind,
            restriction_until: r.until,
            restriction_reason: r.reason,
          },
        })
    },

    async clearRestriction(user_id) {
      await db
        .update(user_standing)
        .set({ restriction_kind: null, restriction_until: null, restriction_reason: null })
        .where(eq(user_standing.user_id, user_id))
    },

    async resetCounters(user_id) {
      await db
        .update(user_standing)
        .set({
          completed_count: 0,
          abandoned_count: 0,
          ghosted_count: 0,
          disputed_won_count: 0,
          disputed_lost_count: 0,
          fraud_confirmed_count: 0,
        })
        .where(eq(user_standing.user_id, user_id))
    },
  }
}
