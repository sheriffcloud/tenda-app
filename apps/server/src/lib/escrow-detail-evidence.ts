/**
 * The evidence half of an escrow detail — proof files and the dispute row —
 * loaded once for both detail routes.
 *
 * Two reasons this is a function rather than four inline queries.
 *
 * DUPLICATION: `/v1/gigs/:id` and `/v1/exchange/:id` were issuing the same
 * pair of `escrow_id` lookups against the same two tables and feeding them to
 * the same projection. Two copies of "what counts as evidence" is one copy too
 * many the moment a third satellite joins it.
 *
 * WASTE: both routes read the pair unconditionally and then threw it away for
 * every non-party. `/v1/gigs/:id` is the public route behind every share link
 * and every push deep-link, so its most common caller is precisely the one
 * whose rows get discarded. Not reading what may not be shown is also the
 * cheaper posture to reason about: an outsider's proof URLs never enter the
 * process.
 *
 * The gate here is an OPTIMISATION, not the guarantee. `scopeEscrowPrivateFields`
 * remains the single thing standing between these rows and the wire — this
 * function returning them by mistake would still be withheld there, and the
 * privacy tests are written against that projection. Both read the one
 * `isParty` boolean the route derived, so they cannot disagree.
 */

import { eq } from 'drizzle-orm'
import { disputes, escrow_proofs } from '@tenda/shared/db/schema'
import type { Dispute, EscrowProof } from '@tenda/shared'
import type { AppDatabase } from '@server/plugins/db'

export interface EscrowEvidence {
  proofs: EscrowProof[]
  dispute: Dispute | null
}

/**
 * `isParty` false short-circuits with no query at all. The empty forms it
 * returns are the same ones an escrow with no proofs and no dispute produces,
 * which is why withholding needs no separate representation on the wire.
 *
 * The empty case is a fresh literal, NOT a shared module constant. A hoisted
 * `Object.freeze({ proofs: [], dispute: null })` would look safe and not be:
 * freeze is shallow, so every spread of it hands out the SAME `proofs` array,
 * and one `push` by any future caller would poison every subsequent outsider's
 * response for the life of the process. Allocating two empties per withheld
 * read is not a cost worth that class of bug.
 */
export async function loadEscrowEvidence(
  db: AppDatabase,
  escrow_id: string,
  isParty: boolean,
): Promise<EscrowEvidence> {
  if (!isParty) return { proofs: [], dispute: null }

  const [proofs, disputeRows] = await Promise.all([
    db.select().from(escrow_proofs).where(eq(escrow_proofs.escrow_id, escrow_id)),
    db.select().from(disputes).where(eq(disputes.escrow_id, escrow_id)).limit(1),
  ])
  return { proofs, dispute: disputeRows[0] ?? null }
}
