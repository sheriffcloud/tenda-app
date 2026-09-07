/**
 * Resolve a `dispute.raised` reference into the facts a channel renders.
 *
 * One query, three LEFT JOINs. Every join is LEFT rather than INNER because
 * each of the three tables can legitimately have no row, and an INNER JOIN
 * would turn any of those into "no alert" — silence, for the case that most
 * needs a human. What each absence means is documented at its field below.
 *
 * At most one row comes back, by schema rather than by the `limit(1)`:
 * `gig_details.escrow_id` is a PRIMARY KEY, `disputes.escrow_id` is UNIQUE, and
 * the transaction is matched on the UNIQUE `tx_ref`. All four access paths are
 * indexed, so this needs nothing from the index review.
 *
 * The escrow's STATUS is deliberately not checked. A retry that lands after the
 * dispute is resolved still describes an event that really happened, and the
 * per-tx_ref stable ids downstream stop it being delivered twice — whereas
 * gating on `status = 'disputed'` would drop the alert for a dispute that was
 * resolved quickly, which is the opposite of what a late alert should do.
 */

import { and, eq } from 'drizzle-orm'
import { disputes } from '@tenda/shared/db/schema'
import { escrows, gig_details, escrow_transactions } from '@tenda/shared/db/schema/escrow'
import type { AppDatabase } from '@server/plugins/db'
import type { AlertOf, AlertRefOf } from '../types'

type DisputeRaisedRef = AlertRefOf<'dispute.raised'>
type DisputeRaisedAlert = AlertOf<'dispute.raised'>

export async function resolveDisputeRaised(
  db: AppDatabase,
  ref: DisputeRaisedRef,
): Promise<DisputeRaisedAlert | null> {
  const [row] = await db
    .select({
      escrow_kind: escrows.kind,
      creator_id: escrows.creator_id,
      counterparty_id: escrows.counterparty_id,
      // NULL for an exchange escrow, which has no gig_details row at all.
      escrow_title: gig_details.title,
      // NULL when the dispute landed on-chain without the POST route — see
      // `raised_by_id` below.
      dispute_id: disputes.id,
      reason: disputes.reason,
      raised_by: disputes.raised_by,
      // The actor of THIS transaction, resolved from the on-chain wallet by
      // applyEscrowEvent. NULL if that wallet maps to no known user.
      actor_id: escrow_transactions.actor_id,
    })
    .from(escrows)
    .leftJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
    .leftJoin(disputes, eq(disputes.escrow_id, escrows.id))
    .leftJoin(
      escrow_transactions,
      // Matched on tx_ref AND escrow_id. tx_ref is globally unique, so the
      // escrow predicate is redundant for correctness — it is here so the
      // planner can use the escrow index instead of considering a scan that
      // joins this escrow to another escrow's transaction.
      and(
        eq(escrow_transactions.escrow_id, escrows.id),
        eq(escrow_transactions.tx_ref, ref.tx_ref),
      ),
    )
    .where(eq(escrows.id, ref.escrow_id))
    .limit(1)

  // The escrow itself is gone. Nothing to alert about and nothing a retry
  // would recover, so this is a real null rather than a thrown error — the
  // consumer drops the job instead of burning five attempts on it.
  if (row === undefined) return null

  return {
    kind: 'dispute.raised',
    // From the ref, not the row: they identify the event this alert is FOR,
    // and re-reading them would only let them differ.
    escrow_id: ref.escrow_id,
    tx_ref: ref.tx_ref,
    dispute_id: row.dispute_id,
    escrow_kind: row.escrow_kind,
    escrow_title: row.escrow_title,
    reason: row.reason,
    /**
     * Chain-attested actor FIRST, triage row second.
     *
     * `disputes.raised_by` is written by the POST route at request time, before
     * anything is on-chain. `escrow_transactions.actor_id` comes from the
     * contract's OWN `raised_by` field on the DisputeRaised event
     * (escrow-events/applications.ts declares `actor_field: 'raised_by'`),
     * resolved wallet → user. It is therefore the raiser the contract named,
     * not whoever sent the transaction — so a relayer, or a 4337 bundler
     * paying gas, cannot displace it.
     *
     * They normally agree. When they cannot — party A posts, their broadcast
     * fails, party B raises the dispute with a raw transaction — the row still
     * names A while the chain says B. Naming the wrong party in a dispute alert
     * is worse than naming none, so the chain wins and the row is the fallback.
     */
    raised_by_id: row.actor_id ?? row.raised_by,
    creator_id: row.creator_id,
    counterparty_id: row.counterparty_id,
  }
}
