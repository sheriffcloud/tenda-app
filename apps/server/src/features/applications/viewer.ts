/**
 * Caller-scoped facts for the gig detail: the reader's own application, and
 * (posters only) how many are waiting on them.
 *
 * Lives in the feature rather than in the route because it is the same
 * question the applications routes answer, asked from a different direction —
 * and because the gig detail route has no business knowing the application
 * table's shape.
 */

import type { GigViewerContext } from '@tenda/shared'
import { drizzleApplicationStore } from '@server/features/applications/store'
import { toApplicationWire } from '@server/features/applications/wire'
import type { AppDatabase } from '@server/plugins/db'

export interface GigViewerQuery {
  escrow_id: string
  creator_id: string
  /** Null for anonymous readers — the gig detail is a public route. */
  viewer_id: string | null
  /** Instant-mode gigs can hold no applications; see below. */
  requires_approval: boolean
}

/**
 * Null when nobody is asking, so the wire field distinguishes "anonymous" from
 * "asked and has nothing" instead of collapsing both to an empty object.
 *
 * Instant mode short-circuits with no queries at all: POST /applications
 * refuses a gig that is not `requires_approval`, and the flag is baked on-chain
 * at create with no update path, so "no applications exist" is a fact here
 * rather than an assumption worth two round-trips per detail read.
 */
export async function loadGigViewerContext(
  db: AppDatabase,
  { escrow_id, creator_id, viewer_id, requires_approval }: GigViewerQuery,
): Promise<GigViewerContext | null> {
  if (viewer_id === null) return null
  const isCreator = viewer_id === creator_id
  if (!requires_approval) {
    return { application: null, open_application_count: isCreator ? 0 : null }
  }

  const store = drizzleApplicationStore(db)
  // The poster never has an application on their own gig (the apply route
  // refuses it), so the two reads are mutually exclusive rather than parallel.
  if (isCreator) {
    return {
      application: null,
      open_application_count: await store.countOpenForEscrow(escrow_id),
    }
  }
  const row = await store.find(escrow_id, viewer_id)
  return {
    application: row === null ? null : toApplicationWire(row),
    open_application_count: null,
  }
}
