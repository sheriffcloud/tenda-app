/**
 * Shared projections for the gig read surface (cutover §3): one column
 * map + one serializer so /v1/gigs, /v1/gigs/:id and any admin search
 * return byte-identical summary shapes.
 */
import { eq } from 'drizzle-orm'
import { escrows, gig_details, users } from '@tenda/shared/db/schema'
import type { GigCategory, GigSummary, UserRef } from '@tenda/shared'
import { USER_COLS } from '@server/lib/users'
import type { AppDatabase, AppTransaction } from '@server/plugins/db'

/** escrows ⨝ gig_details ⨝ users, matches the shared GigSummary wire type. */
export const GIG_SUMMARY_COLS = {
  escrow_id: escrows.id,
  public_feed_revision: escrows.public_feed_revision,
  chain_id: escrows.chain_id,
  asset: escrows.asset,
  amount_raw: escrows.amount_raw,
  status: escrows.status,
  accept_deadline: escrows.accept_deadline,
  created_at: escrows.created_at,
  title: gig_details.title,
  description: gig_details.description,
  category: gig_details.category,
  country: gig_details.country,
  city: gig_details.city,
  latitude: gig_details.latitude,
  longitude: gig_details.longitude,
  remote: gig_details.remote,
  cross_border: gig_details.cross_border,
  proof_requirements: gig_details.proof_requirements,
  requires_approval: escrows.requires_approval,
  creator: USER_COLS,
}

/** Drizzle row (Date columns) → wire shape (ISO strings). */
export type GigSummaryRow = Omit<
  GigSummary,
  'accept_deadline' | 'created_at' | 'category' | 'creator'
> & {
  accept_deadline: Date | null
  created_at: Date
  category: string
  creator: UserRef
}

export function toGigSummary(row: GigSummaryRow): GigSummary {
  return {
    ...row,
    // Route-level validation pins inserts to GIG_CATEGORIES; the column
    // itself is plain text (cutover §11 decision a).
    category: row.category as GigCategory,
    accept_deadline: row.accept_deadline === null ? null : row.accept_deadline.toISOString(),
    created_at: row.created_at.toISOString(),
  }
}

/** Same public projection for HTTP and realtime; null means not a complete gig. */
export async function loadPublicGigSummary(
  db: AppDatabase | AppTransaction,
  escrowId: string,
): Promise<GigSummary | null> {
  const [row] = await db
    .select(GIG_SUMMARY_COLS)
    .from(escrows)
    .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
    .innerJoin(users, eq(users.id, escrows.creator_id))
    .where(eq(escrows.id, escrowId))
    .limit(1)
  return row === undefined ? null : toGigSummary(row)
}
