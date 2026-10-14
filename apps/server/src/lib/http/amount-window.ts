/**
 * The `min_amount_raw`/`max_amount_raw` window, shared by every browse surface
 * that offers it (#101).
 *
 * It lived twice — `routes/v1/gigs/list-filters.ts` and `routes/v1/exchange` —
 * as the same three guards over the same two params against the same column,
 * with byte-identical messages. The copies had already begun to diverge in what
 * PROTECTED them rather than in what they did: the gigs one had tests, the
 * exchange one had none, which is the shape a rule takes just before somebody
 * fixes it in one place only.
 *
 * WHY BIGINT. `amount_raw` is numeric(78,0) carried as a decimal string, so the
 * ordering check must compare numerically: lexicographically '9' > '10', and a
 * string compare would refuse `min=9&max=10`, a perfectly good window. Both
 * routes have a case for exactly that.
 *
 * The parameter is STRUCTURAL rather than either route's query type, for the
 * same reason `chainFilterCondition` takes a registry shape: it keeps the rule
 * reachable from a test without a request, and it means a third surface can
 * adopt the window without widening a union here.
 *
 * ORDER IS BEHAVIOUR AT THE CALL SITE, not here. Every filter guard on both
 * routes answers 400 VALIDATION_ERROR and differs only in its message, so which
 * one runs first decides what the caller is told. This function must therefore
 * stay where each caller already invoked it — gigs runs
 * `category → chain_id → search → amount → proximity`, exchange runs
 * `currency → chain_id → amount`. The gigs sequence is pinned by
 * `gigs-listing.test.ts`'s 'the filter guards refuse in a FIXED order'; that
 * CASE is untouched by this change and passed across the extraction, which is
 * what says the move did not disturb the order. The exchange sequence has its
 * own case in integration/exchange-amount-window.test.ts — added because this
 * paragraph asserted an ordering that route had no test for.
 */
import { gte, lte, type SQL } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { isAmountRaw } from '@server/chains/types'
import { AppError } from '@server/lib/errors'

/**
 * Just the two bounds. Both route query types satisfy this structurally, and
 * neither is imported here — the rule does not care which surface asked.
 */
export interface AmountWindowQuery {
  min_amount_raw?: string
  max_amount_raw?: string
}

/**
 * Validate the window and return its SQL conditions (possibly none).
 *
 * Throws rather than returning an error value, matching every other filter
 * helper: a bad bound is a 400 and there is nothing sensible to do with a
 * half-parsed window.
 */
export function amountWindowConditions(query: AmountWindowQuery): SQL[] {
  const { min_amount_raw, max_amount_raw } = query
  if (min_amount_raw !== undefined && !isAmountRaw(min_amount_raw)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'min_amount_raw must be a decimal integer string')
  }
  if (max_amount_raw !== undefined && !isAmountRaw(max_amount_raw)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'max_amount_raw must be a decimal integer string')
  }
  if (
    min_amount_raw !== undefined &&
    max_amount_raw !== undefined &&
    BigInt(min_amount_raw) > BigInt(max_amount_raw)
  ) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'min_amount_raw must be ≤ max_amount_raw')
  }
  const conditions: SQL[] = []
  if (min_amount_raw !== undefined) conditions.push(gte(escrows.amount_raw, min_amount_raw))
  if (max_amount_raw !== undefined) conditions.push(lte(escrows.amount_raw, max_amount_raw))
  return conditions
}
