/**
 * Shared projections for the exchange read surface (cutover §3): one
 * column map + one serializer so /v1/exchange and /v1/exchange/:id return
 * byte-identical summary shapes.
 */
import { escrows, exchange_details } from '@tenda/shared/db/schema'
import type { ExchangeSummary, UserRef } from '@tenda/shared'
import { USER_COLS } from '@server/lib/users'

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

export function toExchangeSummary(row: ExchangeSummaryRow): ExchangeSummary {
  return {
    ...row,
    accept_deadline: row.accept_deadline === null ? null : row.accept_deadline.toISOString(),
    created_at: row.created_at.toISOString(),
  }
}
