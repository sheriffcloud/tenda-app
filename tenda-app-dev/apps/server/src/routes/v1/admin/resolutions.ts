/**
 * Dispute-resolution collection routes (Issue-3 propose→sign queue):
 *   GET  /v1/admin/resolutions?status= — the signing queue (disputes.read).
 *   POST /v1/admin/resolutions/:id/reject — a key-holder returns a proposal
 *        to the mediator (disputes.execute). This is the multisig "reject"
 *        vote later; today it simply reopens the dispute for a new proposal.
 * The per-dispute propose / current-proposal routes live on admin/disputes.ts
 * (dispute-scoped); both share lib/disputes/resolution-store.ts.
 */
import type { FastifyPluginAsync } from 'fastify'
import { and, eq, inArray } from 'drizzle-orm'
import { dispute_resolutions } from '@tenda/shared/db/schema'
import { ErrorCode, MAX_DISPUTE_REASON_LENGTH } from '@tenda/shared'
import type {
  ApiError,
  DisputeResolution,
  PaginatedResponse,
  RejectResolutionBody,
  ResolutionExecuteBuild,
  ResolutionQueueRow,
  ResolutionStatus,
} from '@tenda/shared'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { requirePermission, uuidParamGuard } from '@server/lib/guards'
import { AppError } from '@server/lib/errors'
import { appEvents } from '@server/lib/events'
import { buildResolveTx } from '@server/lib/escrow/resolve-tx'
import { drizzleTxAttemptsStore, recordTxAttempt } from '@server/lib/tx-attempts'
import {
  ACTIVE_RESOLUTION_STATUSES,
  getResolutionById,
  getResolutionEscrow,
  getResolutionQueue,
  toResolutionWire,
} from '@server/lib/disputes/resolution-store'

const RESOLUTION_STATUSES: readonly ResolutionStatus[] = ['pending', 'executing', 'confirmed', 'rejected']

function narrowStatus(v: unknown): ResolutionStatus | undefined {
  return RESOLUTION_STATUSES.find((s) => s === v)
}

const isActive = (s: ResolutionStatus): boolean =>
  (ACTIVE_RESOLUTION_STATUSES as readonly ResolutionStatus[]).includes(s)

const adminResolutions: FastifyPluginAsync = async (fastify) => {
  // One registration guards every `:id` in this plugin — see uuidParamGuard.
  // Without it a malformed id reached the driver as a uuid comparison and
  // surfaced as a 500 rather than the 404 an unknown id already gets.
  fastify.addHook('preHandler', uuidParamGuard('Resolution not found'))

  // GET /v1/admin/resolutions — signing queue, newest first. Defaults to the
  // actionable 'pending' state.
  fastify.get<{
    Querystring: { status?: string; limit?: number; offset?: number }
    Reply: PaginatedResponse<ResolutionQueueRow> | ApiError
  }>('/', { preHandler: [requirePermission('disputes.read')] }, async (request) => {
    const status = request.query.status === undefined ? 'pending' : narrowStatus(request.query.status)
    if (status === undefined) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, `status must be one of: ${RESOLUTION_STATUSES.join(', ')}`)
    }
    const limit = clampLimit(Number(request.query.limit ?? 20))
    const offset = clampOffset(Number(request.query.offset ?? 0))
    const { rows, total } = await getResolutionQueue(fastify.db, status, limit, offset)
    return { data: rows, total, limit, offset }
  })

  // POST /v1/admin/resolutions/:id/reject — return an active proposal to the
  // mediator with a reason. Idempotency: only pending|executing can be rejected.
  fastify.post<{
    Params: { id: string }
    Body: RejectResolutionBody
    Reply: DisputeResolution | ApiError
  }>('/:id/reject', { preHandler: [requirePermission('disputes.execute')] }, async (request) => {
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : ''
    if (reason.length === 0 || reason.length > MAX_DISPUTE_REASON_LENGTH) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, `reason must be 1–${MAX_DISPUTE_REASON_LENGTH} characters`)
    }

    const existing = await getResolutionById(fastify.db, request.params.id)
    if (existing === undefined) throw new AppError(404, ErrorCode.RESOLUTION_NOT_FOUND, 'Resolution not found')
    if (!isActive(existing.status)) {
      throw new AppError(409, ErrorCode.RESOLUTION_NOT_ACTIVE, `resolution is ${existing.status}, not active`)
    }

    const [updated] = await fastify.db
      .update(dispute_resolutions)
      .set({ status: 'rejected', reject_reason: reason, rejected_by: request.user.id })
      .where(eq(dispute_resolutions.id, existing.id))
      .returning()

    appEvents.emit('admin.reject_resolution', {
      adminId: request.user.id,
      adminRole: request.user.role,
      disputeId: updated.dispute_id,
      resolutionId: updated.id,
      reason,
    })
    return toResolutionWire(updated)
  })

  // POST /v1/admin/resolutions/:id/execute-build — build the unsigned resolve
  // tx for the STORED winner so a key-holder can sign it (C2). The winner is
  // NOT taken from the request: the signer can only sign what was reviewed.
  // Marks the proposal 'executing'; on-chain confirmation later flips it to
  // 'confirmed' via the verify-tx apply hook. No status change to the escrow
  // here — that lands with the confirmed transaction.
  fastify.post<{
    Params: { id: string }
    Reply: ResolutionExecuteBuild | ApiError
  }>('/:id/execute-build', { preHandler: [requirePermission('disputes.execute')] }, async (request) => {
    const resolution = await getResolutionById(fastify.db, request.params.id)
    if (resolution === undefined) throw new AppError(404, ErrorCode.RESOLUTION_NOT_FOUND, 'Resolution not found')
    if (!isActive(resolution.status)) {
      throw new AppError(409, ErrorCode.RESOLUTION_NOT_ACTIVE, `resolution is ${resolution.status}, not active`)
    }

    // The escrow must still be on-chain disputed for the resolve tx to land.
    const row = await getResolutionEscrow(fastify.db, resolution.dispute_id)
    if (row === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Dispute not found')
    if (row.resolved_at !== null) throw new AppError(409, ErrorCode.DISPUTE_RESOLVED, 'Dispute already resolved')
    if (row.escrow_status !== 'disputed') {
      throw new AppError(409, ErrorCode.ESCROW_WRONG_STATUS, `escrow is ${row.escrow_status}, not disputed`)
    }

    const unsigned = await buildResolveTx(
      { db: fastify.db, chains: fastify.chains, contracts: fastify.contracts },
      {
        escrow: {
          id: row.escrow_id,
          chain_id: row.chain_id,
          escrow_contract: row.escrow_contract,
        },
        winner: resolution.proposed_winner,
        signer_user_id: request.user.id,
      },
    )

    // Only advance a still-pending proposal (a concurrent reject wins the race).
    await fastify.db
      .update(dispute_resolutions)
      .set({ status: 'executing' })
      .where(and(eq(dispute_resolutions.id, resolution.id), inArray(dispute_resolutions.status, [...ACTIVE_RESOLUTION_STATUSES])))

    return {
      resolution_id: resolution.id,
      escrow_id: row.escrow_id,
      chain_id: row.chain_id,
      proposed_winner: resolution.proposed_winner,
      dispute_admin_authority: fastify.chains.get(row.chain_id).disputeAuthority ?? null,
      unsigned,
    }
  })

  // POST /v1/admin/resolutions/:id/broadcast — the signer's client-ping after
  // broadcasting the signed resolve tx. Admin-scoped (consistent CORS) and
  // server-authoritative: escrow/chain/action derive from the resolution, the
  // client sends only the tx ref. Records the attempt + enqueues verify-tx,
  // which applies DisputeResolved → the C1 confirm-hook flips the proposal.
  fastify.post<{
    Params: { id: string }
    Body: { tx_ref?: unknown }
    Reply: { status: string } | ApiError
  }>('/:id/broadcast', { preHandler: [requirePermission('disputes.execute')] }, async (request, reply) => {
    const tx_ref = typeof request.body?.tx_ref === 'string' ? request.body.tx_ref.trim() : ''
    if (tx_ref === '') throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'tx_ref is required')

    const resolution = await getResolutionById(fastify.db, request.params.id)
    if (resolution === undefined) throw new AppError(404, ErrorCode.RESOLUTION_NOT_FOUND, 'Resolution not found')
    // Must have been built first (execute-build → 'executing').
    if (resolution.status !== 'executing') {
      throw new AppError(409, ErrorCode.RESOLUTION_NOT_ACTIVE, `resolution is ${resolution.status}, not awaiting a signature`)
    }
    const escrow = await getResolutionEscrow(fastify.db, resolution.dispute_id)
    if (escrow === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Dispute not found')

    const adapter = fastify.chains.get(escrow.chain_id)
    const result = await recordTxAttempt(
      { store: drizzleTxAttemptsStore(fastify.db), queue: fastify.queue, log: request.log },
      {
        user_id: request.user.id,
        escrow_id: escrow.escrow_id,
        action: 'resolve',
        tx_ref,
        chain_id: escrow.chain_id,
        chain_ns: adapter.namespace,
      },
    )
    return reply.code(202).send({ status: 'queued', ...result })
  })
}

export default adminResolutions
