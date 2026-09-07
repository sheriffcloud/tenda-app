/**
 * CO7 dispute-mediation thread, ONE shared conversation per dispute:
 *   GET  /v1/escrows/:id/dispute/messages, parties + any disputes.mediate
 *        holder read the same messages; fetching advances the caller's
 *        read cursor.
 *   POST /v1/escrows/:id/dispute/messages, parties post while the dispute
 *        is unresolved; admins must hold the claim (admin/disputes
 *        claim/release) so two mediators never work at cross purposes.
 * Resolved disputes keep a readable, frozen thread.
 */
import type { FastifyPluginAsync } from 'fastify'
import { and, asc, eq, gte, type SQL } from 'drizzle-orm'
import { dispute_messages, dispute_reads } from '@tenda/shared/db/schema'
import { DISPUTE_MESSAGE_MAX_LENGTH, ErrorCode } from '@tenda/shared'
import type {
  ApiError,
  DisputeMessage,
  DisputeMessageRow,
  DisputeThreadResponse,
  SendDisputeMessageBody,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { assertDisputeThreadAccess } from '@server/lib/disputes/thread-access'
import { validateMessageAttachment } from '@server/lib/uploads/validate-attachment'
import { enqueueNotification, disputePushData } from '@server/lib/notify'
import { buildDisputeThreadContext } from '@server/lib/disputes/thread-context'

const MESSAGES_PAGE_LIMIT = 100

const toWire = (m: DisputeMessageRow): DisputeMessage => ({
  id: m.id,
  dispute_id: m.dispute_id,
  sender_id: m.sender_id,
  body: m.body,
  attachment_url: m.attachment_url,
  attachment_type: m.attachment_type,
  attachment_size: m.attachment_size,
  created_at: m.created_at.toISOString(),
})

const route: FastifyPluginAsync = async (fastify) => {

  // GET, full thread (or the tail after ?after=<ISO>); advances the
  // caller's read cursor as a side effect.
  fastify.get<{
    Params: { id: string }
    Querystring: { after?: string }
    Reply: DisputeThreadResponse | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const { dispute, escrow } = await assertDisputeThreadAccess(fastify.db, request.params.id, request.user)

    const conditions: SQL[] = [eq(dispute_messages.dispute_id, dispute.id)]
    if (request.query.after !== undefined) {
      const after = new Date(request.query.after)
      if (Number.isNaN(after.getTime())) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'after must be an ISO timestamp')
      }
      // INCLUSIVE on purpose: with a strict `gt`, a sibling message in the
      // SAME millisecond as the cursor (poll racing two inserts, or a page
      // boundary) would never be fetched again. The boundary message
      // re-arrives and the client dedupes it by id.
      conditions.push(gte(dispute_messages.created_at, after))
    }

    const [messages] = await Promise.all([
      fastify.db
        .select()
        .from(dispute_messages)
        .where(and(...conditions))
        .orderBy(asc(dispute_messages.created_at))
        .limit(MESSAGES_PAGE_LIMIT),
      fastify.db
        .insert(dispute_reads)
        .values({ dispute_id: dispute.id, user_id: request.user.id, last_read_at: new Date() })
        .onConflictDoUpdate({
          target: [dispute_reads.dispute_id, dispute_reads.user_id],
          set: { last_read_at: new Date() },
        }),
    ])

    const reads = await fastify.db
      .select({ user_id: dispute_reads.user_id, last_read_at: dispute_reads.last_read_at })
      .from(dispute_reads)
      .where(eq(dispute_reads.dispute_id, dispute.id))

    // Context is stable for the life of the thread, so it rides only the full
    // load; the frequent `?after=` tail polls skip the extra queries and the
    // client keeps the copy from the first fetch.
    const context =
      request.query.after === undefined
        ? await buildDisputeThreadContext(fastify.db, escrow, dispute)
        : null

    return {
      dispute_id: dispute.id,
      escrow_id: escrow.id,
      assigned_to_id: dispute.assigned_to,
      read_only: dispute.resolved_at !== null,
      context,
      messages: messages.map(toWire),
      reads: reads.map((r) => ({ user_id: r.user_id, last_read_at: r.last_read_at.toISOString() })),
    }
  })

  // POST, append a message.
  fastify.post<{
    Params: { id: string }
    Body: SendDisputeMessageBody
    Reply: DisputeMessage | ApiError
  }>(
    '/',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { dispute, escrow, isParty } = await assertDisputeThreadAccess(
        fastify.db,
        request.params.id,
        request.user,
      )
      if (dispute.resolved_at !== null) {
        throw new AppError(409, ErrorCode.DISPUTE_RESOLVED, 'Dispute resolved, thread is read-only')
      }
      // Mediators must hold the claim; read access alone doesn't grant a voice.
      if (!isParty && dispute.assigned_to !== request.user.id) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Claim the dispute before posting')
      }

      const body = typeof request.body?.body === 'string' ? request.body.body.trim() : ''
      if (body.length > DISPUTE_MESSAGE_MAX_LENGTH) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `body must be at most ${DISPUTE_MESSAGE_MAX_LENGTH} characters`,
        )
      }
      // Evidence attachment scoped to this escrow's dispute folder (same rules
      // as chat). An attachment-only message may carry an empty body.
      const attachment = validateMessageAttachment(request.body ?? {}, {
        type: 'dispute',
        scopeId: escrow.id,
        userId: request.user.id,
      })
      if (body.length === 0 && attachment === null) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'body or an attachment is required')
      }

      const [inserted] = await fastify.db
        .insert(dispute_messages)
        .values({
          dispute_id: dispute.id,
          sender_id: request.user.id,
          body,
          attachment_url: attachment?.attachment_url ?? null,
          attachment_type: attachment?.attachment_type ?? null,
          attachment_size: attachment?.attachment_size ?? null,
        })
        .returning()
      // The sender has read everything up to their own message.
      await fastify.db
        .insert(dispute_reads)
        .values({ dispute_id: dispute.id, user_id: request.user.id, last_read_at: inserted.created_at })
        .onConflictDoUpdate({
          target: [dispute_reads.dispute_id, dispute_reads.user_id],
          set: { last_read_at: inserted.created_at },
        })

      // Off-chain action, notify the other thread participants directly.
      const recipients = [
        escrow.creator_id,
        escrow.counterparty_id,
        escrow.assigned_counterparty_id,
        dispute.assigned_to,
      ].filter((u): u is string => u !== null && u !== request.user.id)
      for (const user_id of new Set(recipients)) {
        try {
          // persist=false: the dispute thread has its own read surface
          // (dispute_reads.last_read_at), so intra-thread replies push but do
          // not duplicate into the notification centre. The dispute LIFECYCLE
          // (opened/resolved) still persists via the escrow fan-out.
          await enqueueNotification(fastify.queue, {
            user_id,
            title: 'New dispute message',
            body: isParty ? 'The other party replied in your dispute.' : 'The mediator replied in your dispute.',
            data: disputePushData(escrow.id, dispute.id),
            persist: false,
          })
        } catch (err) {
          request.log.warn({ err }, 'dispute message: notification enqueue failed (queue unavailable)')
        }
      }

      return reply.code(201).send(toWire(inserted))
    },
  )
}

export default route
