/**
 * Admin dispute queue (cutover §2 rewrite): v2 has ONE disputes table
 * keyed on escrow_id, the legacy gig/exchange split, mediation threads
 * and HTTP resolve are gone. Resolution itself goes through
 * POST /v1/escrows/:id/resolve (on-chain multisig path, admin-gated
 * there); this surface is read-only triage.
 */
import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { eq, and, or, desc, isNull, isNotNull, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { disputes, dispute_resolutions, escrows, gig_details, users } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type {
  AdminResolutionView,
  ApiError,
  DisputeResolution,
  DisputeSummary,
  PaginatedResponse,
  ProposeResolutionBody,
} from '@tenda/shared'
import { requirePermission, uuidParamGuard } from '@server/lib/guards'
import { AppError } from '@server/lib/errors'
import { appEvents } from '@server/lib/events'
import {
  getActiveResolution,
  getLatestResolution,
  getResolutionEscrow,
  narrowWinner,
  toResolutionWire,
} from '@server/lib/disputes/resolution-store'
import { claimDispute, releaseDispute } from '@server/lib/disputes/claim-store'
import {
  narrowDisputeAssigned,
  narrowDisputeKind,
  narrowDisputeParty,
  narrowDisputeStatus,
} from '@server/lib/disputes/list-query'


const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString())


const adminDisputes: FastifyPluginAsync = async (fastify) => {
  // One registration guards every `:id` in this plugin — the defect was five
  // handlers each forgetting it, so a sixth route inherits the guard.
  fastify.addHook('preHandler', uuidParamGuard('Dispute not found'))

  // Aliased so one row names the raiser, the mediator and the resolver. The
  // raiser is inner-joined (disputes.raised_by is NOT NULL); the other two MUST
  // stay LEFT — assigned_to is nullable and an inner join would drop every
  // unclaimed dispute out of the triage queue, and resolved_by is null on both
  // live disputes and any resolution that bypassed the propose flow.
  const assigneeU = alias(users, 'assignee_u')
  const resolverU = alias(users, 'resolver_u')

  const summaryCols = {
    dispute_id: disputes.id,
    escrow_id: disputes.escrow_id,
    kind: escrows.kind,
    subject_title: gig_details.title,
    raised_by_id: disputes.raised_by,
    raised_by_first_name: users.first_name,
    raised_by_last_name: users.last_name,
    reason: disputes.reason,
    assigned_to_id: disputes.assigned_to,
    assigned_to_first_name: assigneeU.first_name,
    assigned_to_last_name: assigneeU.last_name,
    assigned_at: disputes.assigned_at,
    winner: disputes.winner,
    resolved_by_id: disputes.resolved_by,
    resolved_by_first_name: resolverU.first_name,
    resolved_by_last_name: resolverU.last_name,
    resolved_at: disputes.resolved_at,
    raised_at: disputes.created_at,
  }

  function summaryQuery() {
    return fastify.db
      .select(summaryCols)
      .from(disputes)
      .innerJoin(escrows, eq(disputes.escrow_id, escrows.id))
      .leftJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
      .innerJoin(users, eq(users.id, disputes.raised_by))
      .leftJoin(assigneeU, eq(assigneeU.id, disputes.assigned_to))
      .leftJoin(resolverU, eq(resolverU.id, disputes.resolved_by))
      .$dynamic()
  }

  type SummaryRow = Awaited<ReturnType<typeof summaryQuery>>[number]

  const toSummary = (row: SummaryRow): DisputeSummary => ({
    ...row,
    assigned_at: iso(row.assigned_at),
    resolved_at: iso(row.resolved_at),
    raised_at: iso(row.raised_at),
  })

  // GET /v1/admin/disputes, triage queue, newest first.
  fastify.get<{
    /**
     * The enum-ish members are `string` on purpose — they are untrusted input
     * until the narrowers run, and declaring them as their unions is the lie
     * that let bad values through unchecked. The narrowed result is what the
     * handler uses; `DisputeListQuery` is the CALLER-facing contract.
     */
    Querystring: {
      status?: string
      kind?: string
      assigned?: string
      /** Filter to disputes where this user is a party (user-detail cross-link). */
      party?: string
      limit?: number
      offset?: number
    }
    Reply: PaginatedResponse<DisputeSummary> | ApiError
  }>('/', { preHandler: [requirePermission('disputes.read')] }, async (request) => {
    const { limit = 20, offset = 0 } = request.query
    const status = narrowDisputeStatus(request.query.status)
    const kind = narrowDisputeKind(request.query.kind)
    const assigned = narrowDisputeAssigned(request.query.assigned)
    const party = narrowDisputeParty(request.query.party)
    const safeLimit = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    const conditions: SQL[] = []
    // 'open' also requires the on-chain dispute to be live: the triage row
    // is upserted at request time, so an unconfirmed/abandoned dispute
    // attempt must not surface in the actionable queue.
    if (status === 'open') {
      conditions.push(isNull(disputes.resolved_at), eq(escrows.status, 'disputed'))
    }
    if (status === 'resolved') conditions.push(isNotNull(disputes.resolved_at))
    // Already narrowed — the vocabulary lives in lib/disputes/list-query.ts,
    // never re-spelled here.
    if (kind !== undefined) conditions.push(eq(escrows.kind, kind))
    // Claim-pool views (CO7): my caseload vs the unclaimed pool.
    if (assigned === 'me') conditions.push(eq(disputes.assigned_to, request.user.id))
    if (assigned === 'none') conditions.push(isNull(disputes.assigned_to))
    // Party cross-link: every dispute a given user is involved in. Empty is
    // already folded into undefined by the narrower.
    if (party !== undefined) {
      conditions.push(
        or(
          eq(escrows.creator_id, party),
          eq(escrows.counterparty_id, party),
          eq(escrows.assigned_counterparty_id, party),
        ) as SQL,
      )
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countResult] = await Promise.all([
      summaryQuery().where(where).orderBy(desc(disputes.created_at)).limit(safeLimit).offset(safeOffset),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(disputes)
        .innerJoin(escrows, eq(disputes.escrow_id, escrows.id))
        .where(where),
    ])

    return {
      data: rows.map(toSummary),
      total: countResult[0].count,
      limit: safeLimit,
      offset: safeOffset,
    }
  })

  // GET /v1/admin/disputes/:id, single dispute detail.
  fastify.get<{
    Params: { id: string }
    Reply: DisputeSummary | ApiError
  }>('/:id', { preHandler: [requirePermission('disputes.read')] }, async (request) => {
    const [row] = await summaryQuery().where(eq(disputes.id, request.params.id)).limit(1)
    if (row === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Dispute not found')
    return toSummary(row)
  })

  // POST /v1/admin/disputes/:id/claim, take the dispute from the open pool
  // (CO7). Semantics — atomic race, party refusal, failure shapes — live in
  // lib/disputes/claim-store.
  fastify.post<{
    Params: { id: string }
    Reply: { id: string; assigned_to_id: string } | ApiError
  }>('/:id/claim', { preHandler: [requirePermission('disputes.mediate')] }, async (request) => {
    const claimed = await claimDispute(fastify.db, {
      disputeId: request.params.id,
      userId: request.user.id,
    })
    appEvents.emit('admin.claim_dispute', {
      adminId: request.user.id,
      adminRole: request.user.role,
      disputeId: claimed.id,
    })
    return claimed
  })

  // POST /v1/admin/disputes/:id/release, return the dispute to the open
  // pool. Claimer-only; super_admin can force-release a colleague's claim.
  fastify.post<{
    Params: { id: string }
    Reply: { id: string; assigned_to_id: null } | ApiError
  }>('/:id/release', { preHandler: [requirePermission('disputes.mediate')] }, async (request) => {
    const { id, previousAssignee } = await releaseDispute(fastify.db, {
      disputeId: request.params.id,
      userId: request.user.id,
      role: request.user.role,
    })
    // An already-unclaimed dispute is a no-op, so it emits nothing to audit.
    if (previousAssignee !== null) {
      appEvents.emit('admin.release_dispute', {
        adminId: request.user.id,
        adminRole: request.user.role,
        disputeId: id,
        previousAssignee,
      })
    }
    return { id, assigned_to_id: null }
  })

  // GET /v1/admin/disputes/:id/resolution, the dispute's latest proposal (any
  // state) or null. Lets the detail view show pending / rejected / confirmed.
  fastify.get<{
    Params: { id: string }
    Reply: AdminResolutionView | null | ApiError
  }>('/:id/resolution', { preHandler: [requirePermission('disputes.read')] }, async (request) => {
    const row = await getLatestResolution(fastify.db, request.params.id)
    if (row === undefined) return null
    // Attach the sign context so the panel can reactively gate the sign button
    // (connected wallet must match this chain's authority) without building.
    const escrow = await getResolutionEscrow(fastify.db, request.params.id)
    const chain_id = escrow?.chain_id ?? ''
    const dispute_admin_authority =
      escrow !== undefined && fastify.chains.has(escrow.chain_id)
        ? (fastify.chains.get(escrow.chain_id).disputeAuthority ?? null)
        : null
    return { ...toResolutionWire(row), chain_id, dispute_admin_authority }
  })

  // POST /v1/admin/disputes/:id/resolution, a claim-holding mediator records
  // a verdict → a PENDING proposal for a key-holder to sign. No on-chain
  // effect: resolution is confirmed only when the signed tx lands.
  fastify.post<{
    Params: { id: string }
    Body: ProposeResolutionBody
    Reply: DisputeResolution | ApiError
  }>('/:id/resolution', { preHandler: [requirePermission('disputes.mediate')] }, async (request) => {
    const winner = narrowWinner(request.body?.winner)
    if (winner === null) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'winner must be one of: creator | counterparty | split')
    }

    const [dispute] = await fastify.db
      .select({ id: disputes.id, assigned_to: disputes.assigned_to, resolved_at: disputes.resolved_at, escrow_status: escrows.status })
      .from(disputes)
      .innerJoin(escrows, eq(escrows.id, disputes.escrow_id))
      .where(eq(disputes.id, request.params.id))
      .limit(1)
    if (dispute === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Dispute not found')
    if (dispute.resolved_at !== null) {
      throw new AppError(409, ErrorCode.DISPUTE_RESOLVED, 'Dispute already resolved')
    }
    // The escrow must still be on-chain disputed to be resolvable.
    if (dispute.escrow_status !== 'disputed') {
      throw new AppError(409, ErrorCode.ESCROW_WRONG_STATUS, `escrow is ${dispute.escrow_status}, not disputed`)
    }
    // Only the mediator holding the claim may propose (mirrors the thread).
    if (dispute.assigned_to !== request.user.id) {
      throw new AppError(403, ErrorCode.DISPUTE_NOT_CLAIMED, 'Claim the dispute before proposing a resolution')
    }
    if ((await getActiveResolution(fastify.db, dispute.id)) !== undefined) {
      throw new AppError(409, ErrorCode.RESOLUTION_ALREADY_EXISTS, 'A resolution is already awaiting signature')
    }

    // The partial-unique index is the race backstop for a concurrent propose.
    let inserted
    try {
      ;[inserted] = await fastify.db
        .insert(dispute_resolutions)
        .values({ dispute_id: dispute.id, proposed_winner: winner, proposed_by: request.user.id })
        .returning()
    } catch {
      throw new AppError(409, ErrorCode.RESOLUTION_ALREADY_EXISTS, 'A resolution is already awaiting signature')
    }

    appEvents.emit('admin.propose_resolution', {
      adminId: request.user.id,
      adminRole: request.user.role,
      disputeId: dispute.id,
      resolutionId: inserted.id,
      winner,
    })
    return toResolutionWire(inserted)
  })
}

export default adminDisputes
