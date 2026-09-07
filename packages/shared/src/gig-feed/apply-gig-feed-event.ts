import type { GigSummary } from '../types/gig'
import { classifyGigFeedQuery } from './classify-gig-feed-query'
import { compareGigFeedRevisions } from './compare-gig-feed-revisions'
import { compareGigSummariesByRecency } from './compare-gig-summaries-by-recency'
import { matchesGigFeedQuery } from './matches-gig-feed-query'
import type { ApplyGigFeedEventInput, GigFeedEventResult } from './gig-feed.types'

function withoutGig(items: readonly GigSummary[], escrowId: string): GigSummary[] {
  return items.filter((gig) => gig.escrow_id !== escrowId)
}

export function applyGigFeedEvent(input: ApplyGigFeedEventInput): GigFeedEventResult {
  const { state, event, query } = input
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
    state: { items: [...remaining, event.gig].sort(compareGigSummariesByRecency), revisions },
  }
}
