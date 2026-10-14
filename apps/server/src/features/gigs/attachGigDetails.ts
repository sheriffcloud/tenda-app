/**
 * Attach the listing satellite (gig_details) to a caller's DRAFT gig escrow
 * — the body of POST /v1/gigs, lifted out so the agent one-shot
 * (POST /v1/agent/tasks) runs the identical guards, validation and Stage-6
 * moderation gate rather than a second copy of them.
 *
 * Two halves, exported separately because the one-shot needs them apart
 * (#155): `prepareGigDetails` validates and moderates the BODY and needs
 * only the terms the draft will carry, so it can run before the draft row
 * exists; `upsertGigDetails` needs the row. A gate that ran after the insert
 * left a draft with no listing behind every refused body. `attachGigDetails`
 * composes both over an existing draft — the human route, and the resend.
 *
 * Upsert while draft so a retry after a validation/moderation fix never
 * 409s; once the create tx confirms (draft → open) the satellite is
 * immutable through this path.
 */
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { ErrorCode, MAX_GIG_DESCRIPTION_LENGTH, getAssetMeta, type CreateGigDetailsBody } from '@tenda/shared'
import { gig_details, users } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import type { EscrowRow } from '@server/features/escrows/routes'
import { validateGigDetails, type ValidatedGigDetails } from '@server/features/gigs/gig-details'
import type { AppDatabase } from '@server/plugins/db'
import { moderateGig } from '@server/features/moderation/core/service'
import { buildModerationDeps } from '@server/features/moderation/core/store'

export type GigDetailsRow = typeof gig_details.$inferSelect

export type GigDetailsBody = Partial<Omit<CreateGigDetailsBody, 'escrow_id'>>

/** What moderation prices a listing against: the draft's id (the verdict's subject) and its terms. */
export type ListingSubject = Pick<EscrowRow, 'id' | 'asset' | 'amount_raw'>

/**
 * The listing's RULES, with no moderation and no draft: the creator's stored
 * country, then `validateGigDetails`. Split out so the validate-only agent
 * route (POST /v1/agent/tasks/validate) and `prepareGigDetails` below run the
 * SAME check and cannot drift. The country is returned too, because moderation
 * prices a remote listing against the poster's market.
 */
export async function validateListing(
  fastify: FastifyInstance,
  args: { user_id: string; body: GigDetailsBody },
): Promise<{ details: ValidatedGigDetails; creator_country: string | null }> {
  // Creator's stored country (JWT country can be up to 7 days stale).
  const [creator] = await fastify.db
    .select({ country: users.country })
    .from(users)
    .where(eq(users.id, args.user_id))
    .limit(1)
  const creator_country = creator?.country ?? null
  return { details: validateGigDetails(args.body, creator_country), creator_country }
}

/**
 * Validate the listing body and run it through the Stage-6 gate. Pure over
 * the body and the subject's terms — nothing here reads or writes the draft,
 * which is what lets the one-shot refuse a listing before it mints one.
 */
export async function prepareGigDetails(
  fastify: FastifyInstance,
  args: { escrow: ListingSubject; user_id: string; body: GigDetailsBody },
): Promise<ValidatedGigDetails> {
  const { escrow, user_id, body } = args
  const { details, creator_country } = await validateListing(fastify, { user_id, body })

  // The shared accessor, never a bracket read with `?.decimals ?? 0` behind it: a
  // prototype key ('toString') answered a FUNCTION there, its `.decimals` was
  // undefined, and the fallback quietly moderated the price at ZERO decimals —
  // a 1 USDC gig read as a million dollars. The create path pins `asset` to
  // the seeded table, so a registry miss here is a build/registry disagreement
  // and is said so, not smoothed over (#116 follow-up).
  const meta = getAssetMeta(escrow.asset)
  if (meta === null) {
    throw new AppError(
      500,
      ErrorCode.INTERNAL_ERROR,
      `asset '${escrow.asset}' is not in the shared asset registry this build carries`,
    )
  }

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
      country: details.country ?? creator_country ?? '',
      asset: escrow.asset,
      amount_raw: escrow.amount_raw,
      asset_decimals: meta.decimals,
    },
    { kind: 'gig_published', id: escrow.id },
  )
  if (verdict.decision === 'block') {
    throw new AppError(400, ErrorCode.CONTENT_MODERATED, verdict.reasons.join('; ') || 'Content not allowed')
  }
  return details
}

/** Write the prepared listing onto its draft — insert, or replace on the resend. */
export async function upsertGigDetails(
  db: AppDatabase,
  escrow_id: string,
  details: ValidatedGigDetails,
): Promise<GigDetailsRow> {
  const values = { escrow_id, ...details }
  const [row] = await db
    .insert(gig_details)
    .values(values)
    .onConflictDoUpdate({ target: gig_details.escrow_id, set: values })
    .returning()
  if (row === undefined) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'gig_details upsert returned no row')
  }
  return row
}

/** The listing onto an EXISTING draft: the ownership and state guards, then both halves. */
export async function attachGigDetails(
  fastify: FastifyInstance,
  args: { escrow: EscrowRow; user_id: string; body: GigDetailsBody },
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
  const details = await prepareGigDetails(fastify, { escrow, user_id, body })
  return upsertGigDetails(fastify.db, escrow.id, details)
}
