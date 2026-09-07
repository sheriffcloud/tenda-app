/**
 * GET /v1/applications — the caller's own gig applications.
 *
 * Caller-scoped like /v1/conversations and /v1/subscriptions: no id in the
 * path, identity from the JWT. Deliberately not `/v1/gigs?mine=applied` —
 * that surface returns gigs, and the thing an applicant needs to know is
 * whether they won, which lives on the application.
 *
 * The gig is nested as the standard `GigSummary` so the client reuses the same
 * card it renders everywhere else (lib/gig-read's stated purpose).
 */

import type { FastifyPluginAsync } from 'fastify'
import { desc, eq, sql } from 'drizzle-orm'
import { escrows, gig_applications, gig_details, users } from '@tenda/shared/db/schema'
import type { MyApplication, PaginatedResponse } from '@tenda/shared'
import { GIG_SUMMARY_COLS, toGigSummary } from '@server/lib/gig-read'
import { toApplicationWire } from '@server/features/applications/wire'
import { clampLimit, clampOffset } from '@server/lib/pagination'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: number; offset?: number } }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request): Promise<PaginatedResponse<MyApplication>> => {
      const limit = clampLimit(Number(request.query.limit))
      const offset = clampOffset(Number(request.query.offset))
      const where = eq(gig_applications.applicant_id, request.user.id)

      const rows = await fastify.db
        // GIG_SUMMARY_COLS already nests `creator`, and drizzle allows one
        // level of nesting — so the application's columns ride alongside it
        // under distinct names rather than in a second nested object.
        .select({
          ...GIG_SUMMARY_COLS,
          application_id: gig_applications.id,
          application_applicant_id: gig_applications.applicant_id,
          application_message: gig_applications.message,
          application_status: gig_applications.status,
          application_expires_at: gig_applications.expires_at,
          application_created_at: gig_applications.created_at,
        })
        .from(gig_applications)
        .innerJoin(escrows, eq(escrows.id, gig_applications.escrow_id))
        .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
        // GIG_SUMMARY_COLS nests the poster via USER_COLS, so `users` has to
        // be joined for the summary to be the SAME shape every other gig
        // surface returns — which is the whole point of the shared columns.
        .innerJoin(users, eq(users.id, escrows.creator_id))
        .where(where)
        .orderBy(desc(gig_applications.created_at))
        .limit(limit)
        .offset(offset)

      // Same count shape the gig list uses — one pattern for paginated
      // totals across the codebase, and it joins identically so the number
      // can never disagree with the page it describes.
      const [{ count }] = await fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(gig_applications)
        .innerJoin(escrows, eq(escrows.id, gig_applications.escrow_id))
        .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
        .where(where)

      return {
        // Destructured, not spread-and-hope: `toGigSummary` spreads its input,
        // so leaving the application_* keys in would leak them into the gig.
        data: rows.map(
          ({
            application_id,
            application_applicant_id,
            application_message,
            application_status,
            application_expires_at,
            application_created_at,
            ...gig
          }) => ({
            // Through the SHARED mapper, so this list and the apply/shortlist
            // responses cannot drift in how a date or a null renders.
            application: toApplicationWire({
              id: application_id,
              escrow_id: gig.escrow_id,
              applicant_id: application_applicant_id,
              message: application_message,
              status: application_status,
              expires_at: application_expires_at,
              created_at: application_created_at,
            }),
            gig: toGigSummary(gig),
          }),
        ),
        total: count,
        limit,
        offset,
      }
    },
  )
}

export default route
