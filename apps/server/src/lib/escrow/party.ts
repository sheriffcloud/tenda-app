/**
 * Escrow party membership — the single source of WHICH COLUMNS make someone a
 * party, in both representations the server needs.
 *
 * THREE senses of "party", deliberately. `assigned_counterparty_id` is
 * populated only in the pre-accept direct-offer window, so "is a party to this
 * escrow" means different things depending on whether a pending assignment
 * counts — and the worker-side filters exclude the creator on top of that.
 * These were eight hand-written `or(...)` expressions across the server, split
 * 4/2/2 between the three meanings with nothing naming the distinction:
 * swapping one for another still compiles and still returns rows, it just
 * quietly widens or narrows who can see an escrow.
 *
 * TWO representations of each. A WHERE clause needs Drizzle SQL; a check
 * against an already-loaded row needs a boolean. They cannot share an
 * implementation (one builds AST, one compares strings) — but they must not
 * encode the column set twice either, or the query-level and row-level answers
 * can drift. So each sense is one `readonly PartyColumn[]` here, and both
 * builders read it. Adding a column to a sense is a one-line change that moves
 * both representations together.
 *
 * NOT here: `deriveCaller` in `escrow-routes.ts`, which answers "WHICH role is
 * this caller" (ordered precedence, plus a dispute_admin branch) rather than
 * "is this caller a party". It reads the same three columns and is therefore a
 * third encoding of them; it is left alone on purpose — its output is a role
 * name with precedence semantics the transition state machine depends on, so
 * folding it in here would buy consistency at the price of touching every
 * transition guard.
 */

import { eq, or, type SQL } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'

/** The membership columns, and the row shape every row-level check accepts. */
export type EscrowPartyColumns = Pick<
  typeof escrows.$inferSelect,
  'creator_id' | 'counterparty_id' | 'assigned_counterparty_id'
>

type PartyColumn = keyof EscrowPartyColumns

/** Settled parties: the two columns that persist across the whole lifecycle. */
const SETTLED: readonly PartyColumn[] = ['creator_id', 'counterparty_id']

/** Settled parties plus a pending direct-offer assignee. */
const SETTLED_OR_ASSIGNED: readonly PartyColumn[] = [...SETTLED, 'assigned_counterparty_id']

/** The worker side only — accepted counterparty or pending assignee. */
const COUNTERPARTY_SIDE: readonly PartyColumn[] = ['counterparty_id', 'assigned_counterparty_id']

/**
 * Folded left rather than spread into one `or(...)` call, and that is not
 * cosmetic: these predicates already back live queries (the WS subscribe
 * authorisation, the user-escrow list), and a left fold reproduces the exact
 * `((a or b) or c)` nesting the hand-written expressions emitted. Semantically
 * `or(a, b, c)` is the same thing, but "same rows for a different reason" is a
 * worse guarantee to hand consumers than "same SQL".
 *
 * `or` is only `undefined` for an empty argument list, hence the cast — the
 * established pattern for composed Drizzle conditions in this codebase. Every
 * list above is non-empty, and `reduce` without a seed on a non-empty array
 * returns the single element unchanged.
 */
function matchesAnySql(columns: readonly PartyColumn[], userId: string): SQL {
  return columns
    .map((column) => eq(escrows[column], userId))
    .reduce((left, right) => or(left, right) as SQL)
}

/**
 * `null` is an anonymous caller and matches nothing. The guard is load-bearing
 * rather than defensive: two of the three columns are nullable, so without it
 * an unclaimed escrow would report every anonymous reader as a party.
 */
function matchesAnyRow(
  escrow: EscrowPartyColumns,
  columns: readonly PartyColumn[],
  user_id: string | null,
): boolean {
  if (user_id === null) return false
  return columns.some((column) => escrow[column] === user_id)
}

// ---------- settled parties ------------------------------------------------

export function isEscrowParty(userId: string): SQL {
  return matchesAnySql(SETTLED, userId)
}

/**
 * Row-level twin. Backs PII that exists to be ACTED on (the seller's payout
 * account, which the matched buyer pays into), where a pending assignee has
 * not accepted and the bank details are not theirs to read yet.
 */
export function isEscrowPartyRow(escrow: EscrowPartyColumns, user_id: string | null): boolean {
  return matchesAnyRow(escrow, SETTLED, user_id)
}

// ---------- settled parties + pending assignee ------------------------------

/**
 * Use wherever the user must be able to see or act on an escrow they have not
 * accepted yet; `deriveCaller` maps that same column to the
 * `assigned_counterparty` role.
 */
export function isEscrowPartyOrAssigned(userId: string): SQL {
  return matchesAnySql(SETTLED_OR_ASSIGNED, userId)
}

/**
 * Row-level twin, and the DISCLOSURE gate for the escrow detail routes (see
 * `escrow-detail-scope.ts`). Takes an id and no role, deliberately: the public
 * gig detail is reached through `identifyViewer`, whose role claim can be a
 * token lifetime out of date.
 */
export function isEscrowPartyOrAssignedRow(
  escrow: EscrowPartyColumns,
  user_id: string | null,
): boolean {
  return matchesAnyRow(escrow, SETTLED_OR_ASSIGNED, user_id)
}

// ---------- worker side only ------------------------------------------------

/**
 * Excludes the creator. Backs the "gigs I'm working on" / `role=counterparty`
 * filters, where the point is to exclude escrows the caller posted themselves.
 */
export function isEscrowCounterpartySide(userId: string): SQL {
  return matchesAnySql(COUNTERPARTY_SIDE, userId)
}
