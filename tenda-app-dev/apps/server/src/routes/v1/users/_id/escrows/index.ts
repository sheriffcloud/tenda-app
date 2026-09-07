/**
 * GET /v1/users/:id/escrows, the user's own escrows (gigs and exchanges
 * alike), newest first. Replaces the legacy /users/:id/gigs +
 * /users/:id/exchange split (cutover §2). Own-data only: drafts and full
 * lifecycle states are visible here, unlike the public browse surfaces.
 */
import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { isEscrowCounterpartySide, isEscrowPartyOrAssigned } from '@server/lib/escrow-party'
import { eq, and, desc, sql, type SQL } from 'drizzle-orm'
import { escrows, gig_details, exchange_details } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type { UsersContract, ApiError, EscrowListRow } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { chainFilterCondition } from '@server/lib/chain-filter'

type EscrowsRoute = UsersContract['escrows']

const userEscrows: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: EscrowsRoute['params']
    Querystring: EscrowsRoute['query']
    Reply: EscrowsRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const { id } = request.params

    if (id !== request.user.id) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Can only fetch your own escrows')
    }

    const { role, kind, chain_id, limit = 20, offset = 0 } = request.query
    const safeLimit = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    const conditions: SQL[] = []
    if (role === 'creator') {
      conditions.push(eq(escrows.creator_id, id))
    } else if (role === 'counterparty') {
      // Assigned-but-not-yet-accepted escrows count: the user must act on them.
      conditions.push(isEscrowCounterpartySide(id))
    } else {
      conditions.push(isEscrowPartyOrAssigned(id))
    }
    if (kind === 'gig' || kind === 'exchange') conditions.push(eq(escrows.kind, kind))

    const chainCondition = chainFilterCondition(fastify.chains, chain_id)
    if (chainCondition !== null) conditions.push(chainCondition)

    const where = and(...conditions)

    const [rows, countResult] = await Promise.all([
      fastify.db
        .select({
          id: escrows.id,
          kind: escrows.kind,
          status: escrows.status,
          chain_id: escrows.chain_id,
          asset: escrows.asset,
          amount_raw: escrows.amount_raw,
          title: gig_details.title,
          fiat_currency: exchange_details.fiat_currency,
          creator_id: escrows.creator_id,
          counterparty_id: escrows.counterparty_id,
          accept_deadline: escrows.accept_deadline,
          created_at: escrows.created_at,
        })
        .from(escrows)
        .leftJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
        .leftJoin(exchange_details, eq(exchange_details.escrow_id, escrows.id))
        .where(where)
        .orderBy(desc(escrows.created_at))
        .limit(safeLimit)
        .offset(safeOffset),
      fastify.db.select({ count: sql<number>`count(*)::int` }).from(escrows).where(where),
    ])

    const data: EscrowListRow[] = rows.map((row) => ({
      ...row,
      accept_deadline: row.accept_deadline === null ? null : row.accept_deadline.toISOString(),
      created_at: row.created_at.toISOString(),
    }))

    return {
      data,
      total: countResult[0].count,
      limit: safeLimit,
      offset: safeOffset,
    }
  })
}

export default userEscrows
