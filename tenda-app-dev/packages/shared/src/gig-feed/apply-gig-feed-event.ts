import { classifyGigFeedQuery } from './classify-gig-feed-query'
import { compareGigFeedRevisions } from './compare-gig-feed-revisions'
import {
  compareGigSummariesByRecency,
  type GigFeedRecencyFields,
} from './compare-gig-summaries-by-recency'
import { matchesGigFeedQuery } from './matches-gig-feed-query'
import type { ApplyGigFeedEventInput, GigFeedEventResult } from './gig-feed.types'

function withoutGig<T extends GigFeedRecencyFields>(items: readonly T[], escrowId: string): T[] {
  return items.filter((gig) => gig.escrow_id !== escrowId)
}

/**
 * The ONE reduction of a gig-feed frame onto a client's list: revision guard,
 * query match, remove-then-reinsert, recency sort. All three feed surfaces call
 * it — web's anonymous feed, web's signed-in open-gigs list and mobile's —
 * matching on the frame's full gig, storing whatever `project` returns.
 */
export function applyGigFeedEvent<T extends GigFeedRecencyFields>(
  input: ApplyGigFeedEventInput<T>,
): GigFeedEventResult<T> {
  const { state, event, query, project } = input
  const currentRevision = state.revisions[event.escrow_id]
  if (currentRevision !== undefined) {
    const comparison = compareGigFeedRevisions(event.gig_revision, currentRevision)
    if (comparison < 0) return { outcome: 'ignored_stale', state }
    if (comparison === 0) return { outcome: 'ignored_duplicate', state }
  }

  if (event.type === 'gig_available' && classifyGigFeedQuery(query) === 'server_reconciliation_required') {
    return { outcome: 'reconciliation_required', reason: 'server_only_filter', state }
  }

  const revisions = { ...state.revisions, [event.escrow_id]: event.gig_revision }
  const remaining = withoutGig(state.items, event.escrow_id)
  if (event.type === 'gig_unavailable' || !matchesGigFeedQuery(event.gig, query)) {
    return { outcome: 'applied', state: { items: remaining, revisions } }
  }
  return {
    outcome: 'applied',
    state: { items: [...remaining, project(event.gig)].sort(compareGigSummariesByRecency), revisions },
  }
}
