/**
 * Shared projections for the exchange read surface (cutover §3): one column
 * map + one serializer so /v1/exchange and /v1/exchange/:id return the same
 * summary FIELDS, in the same shapes, from one place.
 *
 * "Byte-identical", which this said until #175, is no longer the claim and must
 * not be restored: `creator` is deliberately viewer-dependent now — a settled
 * party reads the legal name and the face, everyone else reads the abbreviation
 * — so the two surfaces differ on exactly that field, by design. Every other
 * field still comes from here precisely so it cannot drift.
 *
 * The creator is projected through `ExchangePartyRef`, NOT `UserRef` (#175). An
 * exchange row pairs whoever posted it with the money they are moving and a
 * clock, and a full legal name and face beside that is a targeting list — the
 * approach P2P fraud actually uses mid-window. `UserRef` is unchanged and still
 * serves `/v1/gigs`, where publishing the poster IS the product.
 *
 * The SELECT is still `USER_COLS` — the same columns, one source, no second
 * list to keep in step. The name and avatar are INPUTS here rather than wire
 * fields: nothing reaches a caller except through `toExchangePartyRef`, which
 * names every field it copies, so a column added to `USER_COLS` later cannot
 * appear on an exchange row by inheritance.
 */
import { escrows, exchange_details } from '@tenda/shared/db/schema'
import { abbreviatedName, formatFullName } from '@tenda/shared'
import type { ExchangePartyRef, ExchangeSummary, UserRef } from '@tenda/shared'
import { USER_COLS } from '@server/lib/db/users'

/**
 * A creator row as a given viewer may see it.
 *
 * `revealIdentity` is the caller's answer to "is this viewer a SETTLED party to
 * this escrow" — the same line `payout_account` sits behind on the detail
 * route, and for the same stated reason: a pending assignee has not accepted,
 * so the other side's identity is not theirs to read yet. The list surface
 * passes false unconditionally, because an OPEN offer has no settled party.
 *
 * `full_name` is `formatFullName`'s answer, so a party with no profile name
 * reads as `''` rather than `'null null'` — and `null` when withheld, which is
 * what tells a client "not yours to see" apart from "this person has no name".
 */
export function toExchangePartyRef(row: UserRef, revealIdentity: boolean): ExchangePartyRef {
  return {
    id: row.id,
    display_name: abbreviatedName(row.first_name, row.last_name),
    review_score: row.review_score,
    is_seeker: row.is_seeker,
    is_agent: row.is_agent,
    country: row.country,
    full_name: revealIdentity ? formatFullName(row.first_name, row.last_name) : null,
    avatar_url: revealIdentity ? row.avatar_url : null,
  }
}

/** escrows ⨝ exchange_details ⨝ users, matches the shared ExchangeSummary wire type. */
export const EXCHANGE_SUMMARY_COLS = {
  escrow_id: escrows.id,
  chain_id: escrows.chain_id,
  asset: escrows.asset,
  amount_raw: escrows.amount_raw,
  status: escrows.status,
  fiat_amount: exchange_details.fiat_amount,
  fiat_currency: exchange_details.fiat_currency,
  rate: exchange_details.rate,
  payment_window_seconds: exchange_details.payment_window_seconds,
  accept_deadline: escrows.accept_deadline,
  created_at: escrows.created_at,
  creator: USER_COLS,
}

/** Drizzle row (Date columns) → wire shape (ISO strings). */
export type ExchangeSummaryRow = Omit<ExchangeSummary, 'accept_deadline' | 'created_at' | 'creator'> & {
  accept_deadline: Date | null
  created_at: Date
  creator: UserRef
}

/**
 * The LIST projection. `revealIdentity` is false with no argument to weigh:
 * the book serves `status: 'open'` offers, and an open offer has no settled
 * counterparty, so there is nobody on this surface entitled to the name.
 */
export function toExchangeSummary(row: ExchangeSummaryRow): ExchangeSummary {
  return {
    ...row,
    creator: toExchangePartyRef(row.creator, false),
    accept_deadline: row.accept_deadline === null ? null : row.accept_deadline.toISOString(),
    created_at: row.created_at.toISOString(),
  }
}
