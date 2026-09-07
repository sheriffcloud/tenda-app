/**
 * Escrow enums. Every vocabulary that is also used off the database is DERIVED
 * from its shared tuple rather than re-listed here, so the DB column and the
 * apps cannot drift (`escrow_tx_type`, `proof_type`, `application_status`).
 */

import { pgEnum } from 'drizzle-orm/pg-core'
import { PROOF_TYPES } from '../../../constants/proofs'
import { ESCROW_TX_TYPES } from '../../../constants/escrow'
import { APPLICATION_STATUSES } from '../../../constants/applications'

export const escrowKindEnum = pgEnum('escrow_kind', ['gig', 'exchange'])

export const escrowStatusEnum = pgEnum('escrow_status', [
  'draft',
  'open',
  'accepted',
  'submitted',
  'completed',
  'cancelled',
  'refunded',
  'disputed',
  'resolved',
])

/**
 * Statuses with no outgoing transition (lib/escrow.ts state machine):
 * the escrow's book is closed. `disputed` is NOT terminal — it exits
 * only via resolve → resolved.
 */
export const TERMINAL_ESCROW_STATUSES = [
  'completed',
  'cancelled',
  'refunded',
  'resolved',
] as const satisfies ReadonlyArray<(typeof escrowStatusEnum.enumValues)[number]>

/**
 * Derived from the shared ESCROW_TX_TYPES tuple rather than re-listed here
 * (same reasoning as proofTypeEnum below): the DB enum, the chain adapters'
 * `EVENT_BY_TX_TYPE`, and the mobile client-ping bodies then have exactly one
 * source. Re-listing is how `assign_accept`/`unassign` could reach an INSERT
 * that the column rejects at runtime — the compiler cannot see a hand-copied
 * literal drifting from the tuple, but it does see this.
 */
export const escrowTxTypeEnum = pgEnum('escrow_tx_type', ESCROW_TX_TYPES)

/**
 * Derived from the shared PROOF_TYPES tuple rather than re-listed here, so
 * the DB enum, the upload validator and the mobile picker have exactly one
 * source. Adding a type is a one-line change in constants/proofs.ts.
 */
export const proofTypeEnum = pgEnum('proof_type', PROOF_TYPES)

/** Derived from the shared tuple, same reasoning as the two enums above. */
export const applicationStatusEnum = pgEnum('application_status', APPLICATION_STATUSES)
