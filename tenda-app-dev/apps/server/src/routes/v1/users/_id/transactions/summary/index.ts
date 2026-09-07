/**
 * GET /v1/users/:id/transactions/summary — lifetime USDC earned/spent.
 *
 * Separate from the paginated feed on purpose (open_issues MB1). The wallet
 * screen used to reduce over whichever page happened to be loaded and label
 * the result "lifetime": understated for anyone past the first page, and once
 * the feed paginates it would have climbed as the user scrolled. A total over
 * "all rows" cannot be derived from "one page", so it is its own aggregate —
 * and its own request, so paging the feed doesn't recompute it every time.
 *
 * The predicates mirror what the client used to compute, exactly:
 *   earned = chain-attested NET credits where the caller is COUNTERPARTY
 *            (approve | claim_stalled | resolve). Rows with no attested
 *            amount are SKIPPED, never estimated from the gross principal —
 *            the settlement-honesty rule (see project_settlement_amount_honesty).
 *   spent  = principal locked where the caller is CREATOR (create), falling
 *            back to the escrow's own amount when the tx row carries none.
 */
import { FastifyPluginAsync } from 'fastify'
import { eq, inArray, and, sql } from 'drizzle-orm'
import { escrows, escrow_transactions } from '@tenda/shared/db/schema'
import { ErrorCode, USDC_ASSET_IDS } from '@tenda/shared'
import type { UsersContract, ApiError } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { isEscrowParty } from '@server/lib/escrow-party'

type SummaryRoute = UsersContract['transactionsSummary']

/**
 * The asset id whose decimals the raw totals are expressed in. Taken FROM the
 * registry rather than written out: every USDC variant shares decimals (see
 * USDC_DECIMALS), so any of them is a correct answer, and deriving it means a
 * hardcoded id can never go stale and leave the client formatting raw base
 * units as whole USDC.
 */
const USDC_DISPLAY_ASSET = USDC_ASSET_IDS[0]

const userTransactionsSummary: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: SummaryRoute['params']
    Reply: SummaryRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const { id } = request.params

    if (id !== request.user.id) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Can only fetch your own transaction summary')
    }

    // One pass over the user's USDC rows; the two totals are conditional
    // aggregates rather than two queries. SUM over numeric(78,0) stays exact
    // (no float), and ::text keeps it a base-unit string on the wire.
    const [row] = await fastify.db
      .select({
        earned_raw: sql<string>`
          COALESCE(SUM(
            CASE WHEN ${escrow_transactions.type} IN ('approve', 'claim_stalled', 'resolve')
                  AND ${escrows.counterparty_id} = ${id}
                  AND ${escrow_transactions.amount_raw} IS NOT NULL
                 THEN ${escrow_transactions.amount_raw}
                 ELSE 0 END
          ), 0)::text`,
        spent_raw: sql<string>`
          COALESCE(SUM(
            CASE WHEN ${escrow_transactions.type} = 'create'
                  AND ${escrows.creator_id} = ${id}
                 THEN COALESCE(${escrow_transactions.amount_raw}, ${escrows.amount_raw})
                 ELSE 0 END
          ), 0)::text`,
      })
      .from(escrow_transactions)
      .innerJoin(escrows, eq(escrow_transactions.escrow_id, escrows.id))
      .where(
        and(
          isEscrowParty(id),
          // USDC only, from the shared registry — the same membership test the
          // client uses, so the two can't drift into disagreeing totals.
          inArray(escrows.asset, [...USDC_ASSET_IDS]),
        ),
      )

    return {
      earned_raw: row?.earned_raw ?? '0',
      spent_raw: row?.spent_raw ?? '0',
      asset: USDC_DISPLAY_ASSET,
    }
  })
}

export default userTransactionsSummary
