/**
 * GET /v1/disputes — the caller's OWN disputes (party-facing), newest first.
 * Keeps disputes findable after a push notification is dismissed: the admin
 * triage queue (/v1/admin/disputes) is permission-gated and lists everyone's,
 * whereas this returns only escrows where the caller is a party AND a dispute
 * row exists. Read-only; the thread + transitions live under /v1/escrows/:id/*.
 *
 * `status=open` mirrors the admin queue's live-dispute guard (resolved_at IS
 * NULL AND escrow status 'disputed') so an abandoned/unconfirmed dispute
 * attempt never shows as actionable; `status=resolved` is resolved_at IS NOT
 * NULL; omit `status` for the full history.
 */
import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { and, or, eq, desc, isNull, isNotNull, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { disputes, escrows, gig_details, users } from '@tenda/shared/db/schema'
import { ErrorCode, displayName } from '@tenda/shared'
import type { ApiError, MyDisputeRow, MyDisputesQuery, PaginatedResponse, PartyRole } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString())

const myDisputes: FastifyPluginAsync = async (fastify) => {
  // Aliased user joins so one row carries BOTH party names; the caller's role
  // then decides which is "the other party" at map time.
  const creatorU = alias(users, 'creator_u')
  const cpU = alias(users, 'cp_u')

  fastify.get<{
    Querystring: MyDisputesQuery
    Reply: PaginatedResponse<MyDisputeRow> | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const me = request.user.id
    const { status, limit = 20, offset = 0 } = request.query
    if (status !== undefined && status !== 'open' && status !== 'resolved') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, "status must be 'open' or 'resolved'")
    }
    const safeLimit = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    const isParty = or(
      eq(escrows.creator_id, me),
      eq(escrows.counterparty_id, me),
      eq(escrows.assigned_counterparty_id, me),
    ) as SQL

    const conditions: SQL[] = [isParty]
    if (status === 'open') conditions.push(isNull(disputes.resolved_at), eq(escrows.status, 'disputed'))
    if (status === 'resolved') conditions.push(isNotNull(disputes.resolved_at))
    const where = and(...conditions)

    // The effective counterparty is the accepted worker/taker, falling back to
    // a pre-assignment — the same rule the dossier/thread context use.
    const cpJoin = sql`${cpU.id} = coalesce(${escrows.counterparty_id}, ${escrows.assigned_counterparty_id})`

    const [rows, countResult] = await Promise.all([
      fastify.db
        .select({
          dispute_id: disputes.id,
          escrow_id: disputes.escrow_id,
          kind: escrows.kind,
          subject_title: gig_details.title,
          status: escrows.status,
          creator_id: escrows.creator_id,
          creator_first: creatorU.first_name,
          creator_last: creatorU.last_name,
          cp_id: sql<string | null>`coalesce(${escrows.counterparty_id}, ${escrows.assigned_counterparty_id})`,
          cp_first: cpU.first_name,
          cp_last: cpU.last_name,
          reason: disputes.reason,
          raised_by: disputes.raised_by,
          winner: disputes.winner,
          raised_at: disputes.created_at,
          resolved_at: disputes.resolved_at,
        })
        .from(disputes)
        .innerJoin(escrows, eq(disputes.escrow_id, escrows.id))
        .leftJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
        .innerJoin(creatorU, eq(creatorU.id, escrows.creator_id))
        .leftJoin(cpU, cpJoin)
        .where(where)
        .orderBy(desc(disputes.created_at))
        .limit(safeLimit)
        .offset(safeOffset),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(disputes)
        .innerJoin(escrows, eq(disputes.escrow_id, escrows.id))
        .where(where),
    ])

    const data: MyDisputeRow[] = rows.map((row) => {
      const myRole: PartyRole = row.creator_id === me ? 'creator' : 'counterparty'
      const counterparty_name =
        myRole === 'creator'
          ? row.cp_id === null
            ? null
            : displayName(row.cp_first, row.cp_last, row.cp_id)
          : displayName(row.creator_first, row.creator_last, row.creator_id)
      return {
        dispute_id: row.dispute_id,
        escrow_id: row.escrow_id,
        kind: row.kind,
        subject_title: row.subject_title,
        status: row.status,
        my_role: myRole,
        counterparty_name,
        reason: row.reason,
        raised_at: iso(row.raised_at),
        winner: row.winner,
        resolved_at: iso(row.resolved_at),
        raised_by_me: row.raised_by === me,
      }
    })

    return { data, total: countResult[0].count, limit: safeLimit, offset: safeOffset }
  })
}

export default myDisputes
