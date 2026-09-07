/**
 * #82 fraud FLAG, admin-only signal, never an automatic restriction.
 * Of the user's CLOSED two-party engagements, what share went through a
 * dispute? Computed live from escrows (no denormalized column to drift).
 *
 * Denominator counts only terminal escrows that HAD a counterparty:
 * cancelled drafts and nobody-accepted refunds are not engagements and
 * would otherwise let a bad actor dilute the rate below the threshold.
 * Numerator is status='resolved', the only terminal status a disputed
 * escrow can reach (lib/escrow.ts: disputed exits solely via resolve).
 * Live disputes sit on neither side; the book is judged once closed.
 */

import { and, inArray, isNotNull, sql } from 'drizzle-orm'
import { escrows, TERMINAL_ESCROW_STATUSES } from '@tenda/shared/db/schema/escrow'
import type { DisputeRateMetric } from '@tenda/shared'
import type { AppDatabase } from '@server/plugins/db'
import { isEscrowParty } from '@server/lib/escrow-party'
import {
  DISPUTE_RATE_FLAG_THRESHOLD_BPS,
  DISPUTE_RATE_MIN_ENGAGEMENTS,
} from '@server/features/reputation/config'

// Wire type lives in @tenda/shared types/admin.ts (#92 dashboard reads it);
// re-exported so existing server imports keep working.
export type { DisputeRateMetric }

export async function computeDisputeRate(
  db: AppDatabase,
  user_id: string,
): Promise<DisputeRateMetric> {
  const [row] = await db
    .select({
      closed: sql<number>`count(*)::int`,
      disputed: sql<number>`count(*) filter (where ${escrows.status} = 'resolved')::int`,
    })
    .from(escrows)
    .where(
      and(
        isEscrowParty(user_id),
        isNotNull(escrows.counterparty_id),
        inArray(escrows.status, [...TERMINAL_ESCROW_STATUSES]),
      ),
    )

  const closed = row?.closed ?? 0
  const disputed = row?.disputed ?? 0
  const dispute_rate_bps = closed === 0 ? null : Math.round((disputed / closed) * 10_000)
  const fraud_flag =
    dispute_rate_bps !== null &&
    closed >= DISPUTE_RATE_MIN_ENGAGEMENTS &&
    dispute_rate_bps > DISPUTE_RATE_FLAG_THRESHOLD_BPS

  return { closed_engagements: closed, disputed, dispute_rate_bps, fraud_flag }
}
