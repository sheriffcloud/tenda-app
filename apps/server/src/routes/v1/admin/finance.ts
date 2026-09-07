/**
 * Admin finance surface (cutover §2 rewrite): the legacy gig/exchange
 * ledger split collapses into one escrow_transactions query, optionally
 * filtered by escrow kind. Amounts are raw-unit strings (numeric 78,0).
 */
import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { desc, eq, sql, and, gte, lte, type SQL } from 'drizzle-orm'
import { escrows, escrow_transactions } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { requirePermission } from '@server/lib/guards'
import { AppError } from '@server/lib/errors'
import type { ApiError, EscrowKind, FinanceFeeRow } from '@tenda/shared'


function parseDateRange(from?: string, to?: string): { fromDate: Date | null; toDate: Date | null } {
  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(to) : null
  if (fromDate && isNaN(fromDate.getTime())) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'from must be a valid ISO date')
  }
  if (toDate && isNaN(toDate.getTime())) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'to must be a valid ISO date')
  }
  return { fromDate, toDate }
}

const adminFinance: FastifyPluginAsync = async (fastify) => {
  // GET /v1/admin/finance/fees, aggregate platform fee income, grouped by
  // escrow kind + transaction type. Optional filters: from / to (ISO date).
  fastify.get<{
    Querystring: { from?: string; to?: string }
    Reply: unknown | ApiError
  }>('/fees', {
    preHandler: [requirePermission('finance.read')],
  }, async (request) => {
    const { fromDate, toDate } = parseDateRange(request.query.from, request.query.to)

    const conditions: SQL[] = [
      ...(fromDate ? [gte(escrow_transactions.created_at, fromDate)] : []),
      ...(toDate ? [lte(escrow_transactions.created_at, toDate)] : []),
    ]

    const rows = await fastify.db
      .select({
        kind: escrows.kind,
        type: escrow_transactions.type,
        transaction_count: sql<number>`count(*)::int`,
        // text to avoid JS number overflow on large sums
        total_platform_fee: sql<string>`coalesce(sum(${escrow_transactions.platform_fee_raw}), 0)::text`,
        total_amount: sql<string>`coalesce(sum(${escrow_transactions.amount_raw}), 0)::text`,
      })
      .from(escrow_transactions)
      .innerJoin(escrows, eq(escrow_transactions.escrow_id, escrows.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(escrows.kind, escrow_transactions.type)

    const byKind: Record<EscrowKind, { by_type: FinanceFeeRow[]; total_fee_raw: string }> = {
      gig: { by_type: [], total_fee_raw: '0' },
      exchange: { by_type: [], total_fee_raw: '0' },
    }
    let grandTotal = 0n
    for (const row of rows) {
      const bucket = byKind[row.kind]
      bucket.by_type.push({
        type: row.type,
        transaction_count: row.transaction_count,
        total_platform_fee: row.total_platform_fee,
        total_amount: row.total_amount,
      })
      const fee = BigInt(row.total_platform_fee)
      bucket.total_fee_raw = (BigInt(bucket.total_fee_raw) + fee).toString()
      grandTotal += fee
    }

    return {
      period: { from: fromDate ?? null, to: toDate ?? null },
      by_kind: byKind,
      grand_total_fee_raw: grandTotal.toString(),
    }
  })

  // GET /v1/admin/finance/transactions, paginated escrow-transaction ledger.
  // Optional filters: kind ('gig' | 'exchange'), tx_type, from / to.
  fastify.get<{
    Querystring: {
      kind?: string
      from?: string
      to?: string
      tx_type?: string
      limit?: number
      offset?: number
    }
    Reply: { data: unknown[]; total: number; limit: number; offset: number } | ApiError
  }>('/transactions', {
    preHandler: [requirePermission('finance.read')],
  }, async (request) => {
    const { kind, from, to, tx_type, limit = 20, offset = 0 } = request.query
    const safeLimit = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    if (kind !== undefined && kind !== 'gig' && kind !== 'exchange') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'kind must be "gig" or "exchange"')
    }
    const { fromDate, toDate } = parseDateRange(from, to)

    const conditions: SQL[] = [
      ...(kind !== undefined ? [eq(escrows.kind, kind)] : []),
      ...(fromDate ? [gte(escrow_transactions.created_at, fromDate)] : []),
      ...(toDate ? [lte(escrow_transactions.created_at, toDate)] : []),
      ...(tx_type ? [sql`${escrow_transactions.type} = ${tx_type}`] : []),
    ]
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [data, countResult] = await Promise.all([
      fastify.db
        .select({
          id: escrow_transactions.id,
          escrow_id: escrow_transactions.escrow_id,
          kind: escrows.kind,
          type: escrow_transactions.type,
          tx_ref: escrow_transactions.tx_ref,
          amount_raw: escrow_transactions.amount_raw,
          platform_fee_raw: escrow_transactions.platform_fee_raw,
          actor_id: escrow_transactions.actor_id,
          created_at: escrow_transactions.created_at,
        })
        .from(escrow_transactions)
        .innerJoin(escrows, eq(escrow_transactions.escrow_id, escrows.id))
        .where(where)
        .orderBy(desc(escrow_transactions.created_at))
        .limit(safeLimit)
        .offset(safeOffset),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(escrow_transactions)
        .innerJoin(escrows, eq(escrow_transactions.escrow_id, escrows.id))
        .where(where),
    ])
    return { data, total: countResult[0].count, limit: safeLimit, offset: safeOffset }
  })
}

export default adminFinance
