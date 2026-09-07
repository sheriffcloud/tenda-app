/**
 * Escrow proof files (ported from the legacy gig proofs route at the #34
 * cutover). The on-chain submit carries only the 32-byte digest, the
 * actual evidence (Cloudinary URLs) lands here:
 *   POST, counterparty adds proofs while accepted (pre-submit upload) or
 *          submitted (poster requested more evidence). Off-chain.
 *   GET , either party lists them.
 */
import { FastifyPluginAsync } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import { escrow_proofs, disputes } from '@tenda/shared/db/schema'
import { ErrorCode, MAX_ESCROW_PROOFS, proofIdentity } from '@tenda/shared'
import type { ApiError, EscrowProof } from '@tenda/shared'
import { loadEscrowOr404, deriveCaller } from '@server/lib/escrow-routes'
import { AppError } from '@server/lib/errors'
import { enqueueNotification, escrowPushData, disputePushData } from '@server/lib/notify'
import { validateEscrowProofUploads, type EscrowProofUploadInput } from '@server/features/escrows/proofs/validateEscrowProofUploads'

const escrowProofs: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { id: string }
    Body: { proofs: EscrowProofUploadInput[] }
    Reply: EscrowProof[] | ApiError
  }>(
    '/',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params
      const { proofs } = request.body ?? {}

      if (!proofs || proofs.length === 0) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'At least one proof is required')
      }
      validateEscrowProofUploads(proofs, request.user.id)
      const uniqueProofs = [...new Map(proofs.map((proof) => [proofIdentity(proof), proof])).values()]

      const { escrow, inserted, requested } = await fastify.db.transaction(async (tx) => {
        // Serialises count + insert for one escrow, so concurrent batches cannot
        // both observe room below the cap and collectively exceed it.
        await tx.execute(sql`select id from escrows where id = ${id} for update`)
        const lockedEscrow = await loadEscrowOr404(tx, id)
        const proofableStatuses = ['accepted', 'submitted', 'disputed']
        if (!proofableStatuses.includes(lockedEscrow.status)) {
          throw new AppError(
            409,
            ErrorCode.ESCROW_WRONG_STATUS,
            'Proofs can only be added while the escrow is accepted, submitted, or under dispute',
          )
        }
        if (lockedEscrow.counterparty_id !== request.user.id) {
          throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the counterparty can add proofs')
        }

        const existing = await tx.select().from(escrow_proofs).where(eq(escrow_proofs.escrow_id, id))
        const identities = new Set(existing.map(proofIdentity))
        const missing = uniqueProofs.filter((proof) => !identities.has(proofIdentity(proof)))
        if (existing.length + missing.length > MAX_ESCROW_PROOFS) {
          throw new AppError(
            400,
            ErrorCode.VALIDATION_ERROR,
            `Cannot exceed ${MAX_ESCROW_PROOFS} total proofs per escrow (currently have ${existing.length})`,
          )
        }
        const newRows = missing.length === 0
          ? []
          : await tx.insert(escrow_proofs).values(missing.map(({ url, type }) => ({
              escrow_id: id,
              url,
              type: type as EscrowProof['type'],
            }))).onConflictDoNothing().returning()
        const allRows = [...existing, ...newRows]
        const wanted = new Set(uniqueProofs.map(proofIdentity))
        return {
          escrow: lockedEscrow,
          inserted: newRows,
          requested: allRows.filter((proof) => wanted.has(proofIdentity(proof))),
        }
      })

      // Only notify when the escrow is ALREADY submitted, i.e. the on-chain
      // submit confirmed and the poster is reviewing, and the worker is now
      // adding MORE evidence. While `accepted`, this is pre-submit staging:
      // the worker uploads proof, THEN broadcasts the submit tx, which may
      // fail. Notifying here would tell the poster "work is in, review &
      // approve" for a completion that never happened on-chain. The genuine
      // "Work submitted" push rides verify-tx republish (escrow.proof_submitted)
      // once the submit tx confirms, so this path stays silent when accepted.
      if (inserted.length > 0 && escrow.status === 'submitted') {
        try {
          await enqueueNotification(fastify.queue, {
            user_id: escrow.creator_id,
            title: 'Additional proof submitted',
            body: 'The worker added more evidence, review and approve.',
            data: escrowPushData(id, escrow.kind),
          })
        } catch (err) {
          request.log.warn({ err }, 'proofs: notification enqueue failed (queue unavailable)')
        }
      } else if (inserted.length > 0 && escrow.status === 'disputed') {
        // Mid-dispute evidence: alert the other party and the assigned mediator
        // (if any), deep-linking to the shared mediation thread where the proof
        // now shows. Only the counterparty can reach here, so the "other party"
        // is always the creator.
        try {
          const [dispute] = await fastify.db
            .select({ id: disputes.id, assigned_to: disputes.assigned_to })
            .from(disputes)
            .where(eq(disputes.escrow_id, id))
          const recipients = new Set<string>([escrow.creator_id])
          if (dispute?.assigned_to) recipients.add(dispute.assigned_to)
          for (const user_id of recipients) {
            // persist=false: dispute-thread activity has its own read surface.
            await enqueueNotification(fastify.queue, {
              user_id,
              title: 'New dispute evidence',
              body: 'The worker added evidence to the dispute.',
              data: disputePushData(id, dispute?.id ?? null),
              persist: false,
            })
          }
        } catch (err) {
          request.log.warn({ err }, 'proofs: dispute notification enqueue failed (queue unavailable)')
        }
      }

      return reply.code(201).send(requested)
    },
  )

  // GET /v1/escrows/:id/proofs, parties only.
  fastify.get<{
    Params: { id: string }
    Reply: EscrowProof[] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const { id } = request.params
    const escrow = await loadEscrowOr404(fastify.db, id)
    const caller = deriveCaller({ user_id: request.user.id, role: request.user.role, escrow })
    if (caller === null) {
      throw new AppError(403, ErrorCode.FORBIDDEN, `user has no role on escrow ${id}`)
    }
    return fastify.db.select().from(escrow_proofs).where(eq(escrow_proofs.escrow_id, id))
  })
}

export default escrowProofs
