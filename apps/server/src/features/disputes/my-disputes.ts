/**
 * Which disputes are "mine", and which of those are still actionable.
 *
 * One definition for GET /v1/disputes and for the overview's `open_disputes`
 * count, so the dashboard badge and the list it links to cannot disagree.
 */
import { and, eq, isNotNull, isNull, or, type SQL } from 'drizzle-orm'
import { disputes, escrows } from '@tenda/shared/db/schema'

export type MyDisputeStatus = 'open' | 'resolved'

/**
 * The caller is a party (creator, counterparty or assigned counterparty).
 * `open` mirrors the admin queue's live-dispute guard — unresolved AND the
 * escrow still 'disputed' — so an abandoned dispute attempt never shows as
 * actionable; `resolved` is resolved_at IS NOT NULL; no status is the history.
 */
export function myDisputeConditions(me: string, status: MyDisputeStatus | undefined): SQL {
  const isParty = or(
    eq(escrows.creator_id, me),
    eq(escrows.counterparty_id, me),
    eq(escrows.assigned_counterparty_id, me),
  ) as SQL
  const conditions: SQL[] = [isParty]
  if (status === 'open') conditions.push(isNull(disputes.resolved_at), eq(escrows.status, 'disputed'))
  if (status === 'resolved') conditions.push(isNotNull(disputes.resolved_at))
  return and(...conditions) as SQL
}
