/**
 * The `gig_applications` writes an escrow transition makes, as two mirror-image
 * halves of one assignment cycle: settling it when a worker is assigned, and
 * reverting it when that assignment is undone.
 *
 * Split out of ./store because they belong together and to nothing else — the
 * revert only makes sense as the inverse of the settle, and reading them side
 * by side is the only way to see that the pair is complete. Both take the open
 * drizzle transaction rather than the db, because atomicity with the status
 * transition is the whole point: a crash between the two would leave a worker
 * assigned with no record of why, or an escrow reopened whose applicants still
 * believe they lost.
 */

import { and, eq, gt, ne } from 'drizzle-orm'
import { escrows, gig_applications } from '@tenda/shared/db/schema/escrow'
import type { AppTransaction } from '@server/plugins/db'

/**
 * The winner's row → `assigned`, every rival → `passed`, and
 * `assigned_from_application` stamped (D2/D4).
 *
 * Only a LIVE application counts. An assign from a stale or absent one leaves
 * the stamp false, so no abandonment strike can follow — the rule is
 * self-correcting rather than trusting the route to have checked.
 */
export async function settleAssignedApplication(
  tx: AppTransaction,
  escrow_id: string,
  applicant_id: string,
): Promise<{ passed_applicant_ids: string[] }> {
  const [won] = await tx
    .update(gig_applications)
    .set({ status: 'assigned' })
    .where(
      and(
        eq(gig_applications.escrow_id, escrow_id),
        eq(gig_applications.applicant_id, applicant_id),
        eq(gig_applications.status, 'open'),
      ),
    )
    .returning({ id: gig_applications.id })

  if (won === undefined) return { passed_applicant_ids: [] }

  await tx
    .update(escrows)
    .set({ assigned_from_application: true })
    .where(eq(escrows.id, escrow_id))

  // D4: everyone else on this gig is resolved automatically, in the same
  // commit, so no applicant is left waiting on a decision that has already
  // been made. The ids come back so the fan-out can tell exactly these
  // people, and nobody else.
  const passed = await tx
    .update(gig_applications)
    .set({ status: 'passed' })
    .where(
      and(
        eq(gig_applications.escrow_id, escrow_id),
        eq(gig_applications.status, 'open'),
        ne(gig_applications.id, won.id),
      ),
    )
    .returning({ applicant_id: gig_applications.applicant_id })

  return { passed_applicant_ids: passed.map((p) => p.applicant_id) }
}

/** What `revertAssignmentCycle` needs to know about the reopened escrow. */
export interface RevertContext {
  /** Null = indefinitely open, so there is no clock to have run out. */
  accept_deadline: Date | null
  now: Date
}

/**
 * Undo the cycle an `unassign` just reversed.
 *
 * The status rewind alone was never enough. `assign_accept` writes state across
 * THREE places — the escrow row, the winner's application, and every rival's —
 * and only the first was being rewound, which is why a released worker kept
 * reading "You got this gig", a re-assigned worker inherited the previous
 * one's "not available" notice, and the abandonment strike stayed suppressed
 * for the life of the escrow.
 *
 * The winner's row becomes `released` rather than being revived: the poster
 * deliberately let them go, so re-offering them as a live candidate would
 * undo that decision. They can still re-apply, which upserts the row back to
 * `open` — changing your mind is what the upsert is for.
 *
 * Rivals ARE revived, because they lost to a worker who then fell through and
 * nothing about their own application changed. Two bounds on that, and both
 * matter:
 *
 *  - `expires_at` must still be in the future. Reviving a lapsed row would
 *    make it assignable again, re-arming D2's strike for someone who applied
 *    long ago and moved on — exactly what `isAssignable` refuses to do.
 *  - the gig must still be taking workers. Past `accept_deadline` the poster
 *    cannot assign ANYONE (the escrow is on the refund path), so a revived
 *    row would be a dead application quietly occupying one of the applicant's
 *    `max_open_applications` slots.
 *
 * Revival can push an applicant over that cap, and that is accepted rather
 * than guarded: `checkApplicationCapacity` already clamps, so the only effect
 * is that they cannot apply to anything NEW until one settles. Enforcing the
 * cap here would mean dropping some revivals arbitrarily, which is worse. The
 * original TTL bounds the whole thing, and it is the window the applicant
 * already agreed to (`APPLY_OBLIGATION`: the poster can pick you at any time
 * until your application expires).
 */
export async function revertAssignmentCycle(
  tx: AppTransaction,
  escrow_id: string,
  { accept_deadline, now }: RevertContext,
): Promise<{ revived_applicant_ids: string[] }> {
  await tx
    .update(gig_applications)
    .set({ status: 'released' })
    .where(
      and(
        eq(gig_applications.escrow_id, escrow_id),
        eq(gig_applications.status, 'assigned'),
      ),
    )

  // `>=`, not `>`, to agree with `canAssign` (`now <= deadline`) to the
  // millisecond: the instant the poster can still assign someone is the
  // instant a revived application is still worth having.
  const stillTakingWorkers =
    accept_deadline === null || accept_deadline.getTime() >= now.getTime()
  if (!stillTakingWorkers) return { revived_applicant_ids: [] }

  const revived = await tx
    .update(gig_applications)
    .set({ status: 'open' })
    .where(
      and(
        eq(gig_applications.escrow_id, escrow_id),
        eq(gig_applications.status, 'passed'),
        gt(gig_applications.expires_at, now),
      ),
    )
    .returning({ applicant_id: gig_applications.applicant_id })

  return { revived_applicant_ids: revived.map((r) => r.applicant_id) }
}
