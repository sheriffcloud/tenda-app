import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { eq, desc, and, sql } from 'drizzle-orm'
import { escrows, escrow_transactions, disputes, gig_details } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type { UsersContract, ApiError } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { userFeedPredicate } from '@server/lib/escrow-feed'

type TransactionsRoute = UsersContract['transactions']

const userTransactions: FastifyPluginAsync = async (fastify) => {
  // GET /v1/users/:id/transactions — the caller's PERSONAL feed: the rows
  // they performed or that moved value to/from them, gigs and exchanges alike,
  // in one descending-chronological list for the wallet screen.
  //
  // Not the escrow's audit trail. Being a party to an escrow used to be the
  // whole filter, which put the counterparty's actions in your wallet ("Gig
  // accepted", "Proof submitted" on the POSTER's feed). The per-escrow trail
  // is still complete at GET /v1/escrows/:id/transactions; see lib/escrow-feed
  // for why the split is keyed by role and not by `actor_id`.
  fastify.get<{
    Params: TransactionsRoute['params']
    Querystring: TransactionsRoute['query']
    Reply: TransactionsRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const { id } = request.params

    if (id !== request.user.id) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Can only fetch your own transactions')
    }

    const { limit = 20, offset = 0 } = request.query
    const safeLimit = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    // Not "every row on every escrow I touch" — only the rows I acted on or
    // that moved value to/from me. Same predicate on the count query, or
    // `total` would advertise pages the feed can no longer fill.
    const visible = userFeedPredicate(id)

    const [rows, countResult] = await Promise.all([
      fastify.db
        .select({
          id: escrow_transactions.id,
          escrow_id: escrow_transactions.escrow_id,
          type: escrow_transactions.type,
          tx_ref: escrow_transactions.tx_ref,
          amount_raw: escrow_transactions.amount_raw,
          platform_fee_raw: escrow_transactions.platform_fee_raw,
          creator_payout_raw: escrow_transactions.creator_payout_raw,
          actor_id: escrow_transactions.actor_id,
          created_at: escrow_transactions.created_at,
          // Winner only matters on resolve rows, the join condition keeps
          // other rows NULL without a second query.
          dispute_winner: disputes.winner,
          escrow_kind: escrows.kind,
          escrow_title: gig_details.title,
          escrow_amount_raw: escrows.amount_raw,
          escrow_asset: escrows.asset,
          escrow_chain_id: escrows.chain_id,
          escrow_status: escrows.status,
          escrow_creator_id: escrows.creator_id,
          escrow_counterparty_id: escrows.counterparty_id,
        })
        .from(escrow_transactions)
        .innerJoin(escrows, eq(escrow_transactions.escrow_id, escrows.id))
        .leftJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
        .leftJoin(
          disputes,
          and(
            eq(disputes.escrow_id, escrow_transactions.escrow_id),
            eq(escrow_transactions.type, 'resolve'),
          ),
        )
        .where(visible)
        .orderBy(desc(escrow_transactions.created_at))
        .limit(safeLimit)
        .offset(safeOffset),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(escrow_transactions)
        .innerJoin(escrows, eq(escrow_transactions.escrow_id, escrows.id))
        .where(visible),
    ])

    const data = rows.map((row) => ({
      id: row.id,
      escrow_id: row.escrow_id,
      type: row.type,
      tx_ref: row.tx_ref,
      amount_raw: row.amount_raw,
      platform_fee_raw: row.platform_fee_raw,
      creator_payout_raw: row.creator_payout_raw,
      actor_id: row.actor_id,
      created_at: row.created_at.toISOString(),
      winner: row.dispute_winner ?? null,
      escrow: {
        id: row.escrow_id,
        kind: row.escrow_kind,
        title: row.escrow_title,
        amount_raw: row.escrow_amount_raw,
        asset: row.escrow_asset,
        chain_id: row.escrow_chain_id,
        status: row.escrow_status,
        creator_id: row.escrow_creator_id,
        counterparty_id: row.escrow_counterparty_id,
      },
    }))

    return {
      data,
      total: countResult[0].count,
      limit: safeLimit,
      offset: safeOffset,
    }
  })
}

export default userTransactions
