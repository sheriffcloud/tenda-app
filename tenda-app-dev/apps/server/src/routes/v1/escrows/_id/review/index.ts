/**
 * POST /v1/escrows/:id/review, leave a review for a completed or resolved
 * escrow (gig or exchange alike; ported from the legacy gig review route
 * at the #34 cutover). One review per reviewer per escrow
 * (reviews_escrow_reviewer_uq); the reviewee's running review_score
 * (0–5 average, numeric(3,2)) recomputes atomically in the same
 * transaction.
 */
import { FastifyPluginAsync } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import { reviews, users, gig_details } from '@tenda/shared/db/schema'
import { isValidReviewScore, MAX_REVIEW_COMMENT_LENGTH, ErrorCode } from '@tenda/shared'
import type { ApiError, Review, ReviewInput } from '@tenda/shared'
import { loadEscrowOr404 } from '@server/lib/escrow-routes'
import { handleUniqueConflict } from '@server/lib/db'
import { AppError, requireBody } from '@server/lib/errors'
import { appEvents } from '@server/lib/events'

const reviewEscrow: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { id: string }
    Body: ReviewInput
    Reply: Review | ApiError
  }>(
    '/',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params
      const { score, comment } = requireBody(request.body)
      const reviewerId = request.user.id

      const escrow = await loadEscrowOr404(fastify.db, id)
      if (escrow.status !== 'completed' && escrow.status !== 'resolved') {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          'Reviews are only allowed on completed or resolved escrows',
        )
      }

      // Reviewer must be a party.
      if (escrow.creator_id !== reviewerId && escrow.counterparty_id !== reviewerId) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Only a party to the escrow can leave a review')
      }

      if (comment && comment.length > MAX_REVIEW_COMMENT_LENGTH) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `comment must be at most ${MAX_REVIEW_COMMENT_LENGTH} characters`,
        )
      }

      if (!isValidReviewScore(score)) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'score must be an integer between 1 and 5')
      }

      // Reviewee is the other party.
      const revieweeId =
        escrow.creator_id === reviewerId ? escrow.counterparty_id : escrow.creator_id
      if (revieweeId === null) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Cannot determine reviewee, escrow has no counterparty')
      }

      try {
        const review = await fastify.db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(reviews)
            .values({
              escrow_id: id,
              reviewer_id: reviewerId,
              reviewee_id: revieweeId,
              score,
              comment: comment ?? null,
            })
            .returning()

          // Recompute the reviewee's 0–5 average atomically. Single
          // UPDATE … SET … = (SELECT …) avoids the read-modify-write race
          // between two concurrent reviews; the subquery sees the
          // just-inserted row inside this transaction.
          await tx
            .update(users)
            .set({
              review_score: sql`(
                SELECT ROUND(AVG(score)::numeric, 2)
                FROM ${reviews}
                WHERE reviewee_id = ${revieweeId}
              )`,
              updated_at: new Date(),
            })
            .where(eq(users.id, revieweeId))

          return inserted
        })

        // Gig title for the push copy; exchanges have none.
        const [details] = await fastify.db
          .select({ title: gig_details.title })
          .from(gig_details)
          .where(eq(gig_details.escrow_id, id))
          .limit(1)

        appEvents.emit('review.submitted', {
          escrowId: id,
          reviewerId,
          revieweeId,
          score: review.score,
          title: details?.title ?? null,
        })

        return reply.code(201).send({ ...review, created_at: review.created_at.toISOString() })
      } catch (err: unknown) {
        // Postgres unique violation on reviews_escrow_reviewer_uq
        handleUniqueConflict(err, ErrorCode.REVIEW_ALREADY_EXISTS, 'You have already reviewed this escrow')
      }
    },
  )
}

export default reviewEscrow
