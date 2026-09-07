import { randomUUID } from 'node:crypto'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { GIG_FEED_CHANNEL, type GigUnavailableCause } from '@tenda/shared'
import { escrows } from '@tenda/shared/db/schema/escrow'
import type { FastifyInstance } from 'fastify'
import { loadPublicGigSummary } from '@server/lib/gig-read'

export type GigFeedChange = 'available' | GigUnavailableCause

export async function publishGigFeedChange(
  fastify: FastifyInstance,
  escrowId: string,
  change: GigFeedChange,
): Promise<void> {
  const frame = await fastify.db.transaction(async (tx) => {
    const [revisionRow] = await tx
      .update(escrows)
      .set({ public_feed_revision: sql`${escrows.public_feed_revision} + 1` })
      .where(and(eq(escrows.id, escrowId), eq(escrows.kind, 'gig')))
      .returning({ revision: escrows.public_feed_revision })
    if (revisionRow === undefined) return null

    const gig = await loadPublicGigSummary(tx, escrowId)
    const [visible] = await tx
      .select({ id: escrows.id })
      .from(escrows)
      .where(and(
        eq(escrows.id, escrowId),
        eq(escrows.status, 'open'),
        eq(escrows.hidden, false),
        isNull(escrows.assigned_counterparty_id),
        or(isNull(escrows.accept_deadline), gt(escrows.accept_deadline, new Date())),
      ))
      .limit(1)
    const base = {
      channel: GIG_FEED_CHANNEL,
      event_id: randomUUID(),
      escrow_id: escrowId,
      gig_revision: revisionRow.revision,
      occurred_at: new Date().toISOString(),
    } as const
    return visible !== undefined && gig !== null
      ? { ...base, type: 'gig_available', gig } as const
      : { ...base, type: 'gig_unavailable', cause: change === 'available' ? 'not_public' : change } as const
  })
  // Publish only after commit. The row update serialises concurrent fan-outs,
  // so each revision describes the same authoritative snapshot it carries.
  if (frame !== null) fastify.realtime.publish(frame)
}
