/**
 * Attach the listing satellite (gig_details) to a caller's DRAFT gig escrow
 * — the body of POST /v1/gigs, lifted out so the agent one-shot
 * (POST /v1/agent/tasks) runs the identical guards, validation and Stage-6
 * moderation gate rather than a second copy of them.
 *
 * Upsert while draft so a retry after a validation/moderation fix never
 * 409s; once the create tx confirms (draft → open) the satellite is
 * immutable through this path.
 */
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { ASSET_META, ErrorCode, MAX_GIG_DESCRIPTION_LENGTH, type CreateGigDetailsBody } from '@tenda/shared'
import { gig_details, users } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import type { EscrowRow } from '@server/lib/escrow-routes'
import { validateGigDetails } from '@server/lib/gig-details'
import { moderateGig } from '@server/features/moderation/service'
import { buildModerationDeps } from '@server/features/moderation/store'

export type GigDetailsRow = typeof gig_details.$inferSelect

export async function attachGigDetails(
  fastify: FastifyInstance,
  args: { escrow: EscrowRow; user_id: string; body: Partial<Omit<CreateGigDetailsBody, 'escrow_id'>> },
): Promise<GigDetailsRow> {
  const { escrow, user_id, body } = args
  if (escrow.creator_id !== user_id) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the escrow creator can attach gig details')
  }
  if (escrow.kind !== 'gig') {
    throw new AppError(409, ErrorCode.ESCROW_WRONG_STATUS, 'Details can only be attached to gig escrows')
  }
  if (escrow.status !== 'draft') {
    throw new AppError(409, ErrorCode.ESCROW_WRONG_STATUS, 'Details can only be attached while the escrow is a draft')
  }

  // Creator's stored country (JWT country can be up to 7 days stale).
  const [creator] = await fastify.db
    .select({ country: users.country })
    .from(users)
    .where(eq(users.id, user_id))
    .limit(1)

  const details = validateGigDetails(body, creator?.country ?? null)

  // Stage-6 gate: block verdicts never reach the feed; warns pass with
  // the verdict recorded for the admin queue.
  const verdict = await moderateGig(
    buildModerationDeps(fastify),
    {
      title: details.title,
      description: (details.description ?? '').slice(0, MAX_GIG_DESCRIPTION_LENGTH),
      category: details.category,
      // Remote gigs persist no country; for price-sanity stats fall back to
      // the poster's market (moderation-only, never stored on the gig).
      country: details.country ?? creator?.country ?? '',
      asset: escrow.asset,
      amount_raw: escrow.amount_raw,
      asset_decimals: ASSET_META[escrow.asset]?.decimals ?? 0,
    },
    { kind: 'gig_published', id: escrow.id },
  )
  if (verdict.decision === 'block') {
    throw new AppError(400, ErrorCode.CONTENT_MODERATED, verdict.reasons.join('; ') || 'Content not allowed')
  }

  const values = { escrow_id: escrow.id, ...details }
  const [row] = await fastify.db
    .insert(gig_details)
    .values(values)
    .onConflictDoUpdate({ target: gig_details.escrow_id, set: values })
    .returning()
  if (row === undefined) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'gig_details upsert returned no row')
  }
  return row
}
