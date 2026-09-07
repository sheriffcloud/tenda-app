import { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { reports, escrows, gig_details, messages, users, reviews } from '@tenda/shared/db/schema'
import { ErrorCode, REPORT_CONTENT_TYPES, REPORT_REASONS } from '@tenda/shared'
import type { ApiError, ReportContentType, ReportReason } from '@tenda/shared'
import { isPostgresUniqueViolation } from '@server/lib/db'
import { AppError, requireBody } from '@server/lib/errors'

const reportsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body:  { content_type: ReportContentType; content_id: string; reason: ReportReason; note?: string }
    Reply: { id: string } | ApiError
  }>(
    '/',
    {
      // Tighter rate limit, prevents admin queue flooding from a single user.
      config:     { rateLimit: { max: 5, timeWindow: '1 minute' } },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { content_type, content_id, reason, note } = requireBody(request.body)
      const reporterId = request.user.id

      if (!REPORT_CONTENT_TYPES.includes(content_type)) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, `content_type must be one of: ${REPORT_CONTENT_TYPES.join(', ')}`)
      }

      if (!REPORT_REASONS.includes(reason)) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, `reason must be one of: ${REPORT_REASONS.join(', ')}`)
      }

      // Resolve reported_user_id + content_snapshot server-side.
      // The client must never be trusted to supply the owner of the reported content.
      let reportedUserId: string
      let contentSnapshot: string | null = null

      switch (content_type) {
        case 'escrow': {
          // Title for gigs; exchanges have no text content worth snapshotting.
          const [row] = await fastify.db
            .select({ creator_id: escrows.creator_id, title: gig_details.title })
            .from(escrows)
            .leftJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
            .where(eq(escrows.id, content_id)).limit(1)
          if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, 'Content not found')
          reportedUserId  = row.creator_id
          contentSnapshot = row.title
          break
        }
        case 'message': {
          const [row] = await fastify.db
            .select({ sender_id: messages.sender_id, content: messages.content })
            .from(messages).where(eq(messages.id, content_id)).limit(1)
          if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, 'Content not found')
          reportedUserId  = row.sender_id
          contentSnapshot = row.content
          break
        }
        case 'user': {
          const [row] = await fastify.db
            .select({ id: users.id, bio: users.bio })
            .from(users).where(eq(users.id, content_id)).limit(1)
          if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, 'Content not found')
          reportedUserId  = row.id
          contentSnapshot = row.bio
          break
        }
        case 'review': {
          const [row] = await fastify.db
            .select({ reviewer_id: reviews.reviewer_id, comment: reviews.comment })
            .from(reviews).where(eq(reviews.id, content_id)).limit(1)
          if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, 'Content not found')
          reportedUserId  = row.reviewer_id
          contentSnapshot = row.comment ?? null
          break
        }
      }

      // Prevent self-reports.
      if (reportedUserId === reporterId) throw new AppError(400, ErrorCode.CANNOT_REPORT_SELF, 'Cannot report your own content')

      try {
        const [inserted] = await fastify.db
          .insert(reports)
          .values({
            reporter_id:      reporterId,
            reported_user_id: reportedUserId,
            content_type,
            content_id,
            reason,
            note:             note ?? null,
            content_snapshot: contentSnapshot,
          })
          .onConflictDoNothing()
          .returning({ id: reports.id })

        if (!inserted) {
          // Duplicate, idempotent re-submit (e.g. client retry after network error).
          const [existing] = await fastify.db
            .select({ id: reports.id })
            .from(reports)
            .where(and(
              eq(reports.reporter_id, reporterId),
              eq(reports.content_type, content_type),
              eq(reports.content_id, content_id),
            ))
            .limit(1)
          return reply.code(200).send({ id: existing!.id })
        }

        return reply.code(201).send({ id: inserted.id })
      } catch (err) {
        if (isPostgresUniqueViolation(err)) {
          const [existing] = await fastify.db
            .select({ id: reports.id })
            .from(reports)
            .where(and(
              eq(reports.reporter_id, reporterId),
              eq(reports.content_type, content_type),
              eq(reports.content_id, content_id),
            ))
            .limit(1)
          return reply.code(200).send({ id: existing!.id })
        }
        throw err
      }
    },
  )
}

export default reportsRoute
