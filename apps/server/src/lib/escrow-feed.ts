/**
 * SQL predicate behind `GET /v1/users/:id/transactions` — the user's personal
 * transaction feed, generated from the shared `TX_FEED_VISIBILITY` matrix so
 * the server never re-lists which transaction types belong to which side.
 *
 * Must be applied to BOTH the page query and the count query. Filtering on the
 * client instead is not an option: `total` drives `usePaginatedList`'s
 * `hasMore`, so an unfiltered count over a filtered render would page a 20-row
 * request down to a handful of visible rows and then stop early.
 */

import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { escrows, escrow_transactions } from '@tenda/shared/db/schema'
import { ACTOR_SCOPED_FEED_TX_TYPES, feedTxTypesFor } from '@tenda/shared'
import { isEscrowParty } from '@server/lib/escrow-party'

// Derived once at module load, not per request: the matrix is static, and
// re-deriving it inside the handler reads as if it could vary by caller.
const CREATOR_TYPES = feedTxTypesFor('creator')
const COUNTERPARTY_TYPES = feedTxTypesFor('counterparty')
const ACTOR_TYPES = [...ACTOR_SCOPED_FEED_TX_TYPES]

/**
 * Rows that belong in `userId`'s feed:
 *
 *   (I am the creator      AND the type is creator-visible)
 *   OR (I am the counterparty AND the type is counterparty-visible)
 *   OR (the type is actor-scoped AND I am a party AND (I acted OR no actor
 *       could be resolved))
 *
 * The NULL-actor arm is deliberate. `actor_id` is resolved by wallet lookup
 * and comes back null whenever the acting wallet is not linked to a user, so
 * requiring a match would erase the row from BOTH parties' history. Showing it
 * to both is the recoverable failure.
 */
export function userFeedPredicate(userId: string): SQL {
  const clauses: SQL[] = [
    and(
      eq(escrows.creator_id, userId),
      inArray(escrow_transactions.type, CREATOR_TYPES),
    ) as SQL,
    and(
      eq(escrows.counterparty_id, userId),
      inArray(escrow_transactions.type, COUNTERPARTY_TYPES),
    ) as SQL,
  ]

  if (ACTOR_TYPES.length > 0) {
    clauses.push(
      and(
        inArray(escrow_transactions.type, ACTOR_TYPES),
        isEscrowParty(userId),
        or(eq(escrow_transactions.actor_id, userId), isNull(escrow_transactions.actor_id)),
      ) as SQL,
    )
  }

  return or(...clauses) as SQL
}
