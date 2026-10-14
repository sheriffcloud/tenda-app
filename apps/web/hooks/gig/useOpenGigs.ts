'use client'

/**
 * The signed-in workspace's open-gig feed: one page of `GET /v1/gigs`, kept
 * LIVE off the same `feed:gigs` broadcast the anonymous feed reads and through
 * the same reduction (`useGigFeedRealtime`). Extracted from the list column in
 * #60 so the column and the full-pane card grid — two views of ONE list — read
 * one fetch path, one retry and one realtime subscription rather than two.
 *
 * Storing whole `GigSummary` rows, unlike the public feed's trimmed card
 * model, because both views render the amount — that difference is exactly
 * what the reducer's `project` exists for.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GigCategory, GigListQuery, GigSummary } from '@tenda/shared'
import { api } from '@/api/client'
import { useGigFeedRealtime } from '@/hooks/gig/useGigFeedRealtime'

export const OPEN_GIGS_LIMIT = 30

/** This feed stores what it renders, so the projection is identity. */
const keepSummary = (gig: GigSummary): GigSummary => gig

export interface OpenGigsFilters {
  category: GigCategory | null
  /** Free-text search over title + brief; '' means none. */
  q: string
}

/**
 * `total` rides EVERY phase, null only until the first answer. It used to live
 * on `ready` alone, so a failed background revalidation — which keeps the rows
 * — dropped the count from under them. The siblings key their count on
 * "has this ever fetched", never on the outcome of the latest attempt.
 */
interface State {
  /** The query these rows answer — a changed filter makes them stale. */
  query: GigListQuery
  phase: 'loading' | 'ready' | 'error'
  gigs: GigSummary[]
  total: number | null
}

export interface OpenGigsState {
  phase: State['phase']
  gigs: GigSummary[]
  total: number | null
  /** The reader ASKED, so say something is happening. A reconcile does not. */
  retry: () => void
}

function fresh(query: GigListQuery): State {
  return { query, phase: 'loading', gigs: [], total: null }
}

export function useOpenGigs({ category, q }: OpenGigsFilters): OpenGigsState {
  // Memoised so the realtime hook is not handed a new query every render.
  const query = useMemo<GigListQuery>(
    () => ({
      limit: OPEN_GIGS_LIMIT,
      ...(category === null ? {} : { category }),
      ...(q === '' ? {} : { q }),
    }),
    [category, q],
  )
  const [state, setState] = useState<State>(() => fresh(query))
  // Rows fetched for a PREVIOUS filter are not this filter's answer: derive a
  // loading state for them rather than resetting inside an effect, which is
  // a render cascade and lets one frame of the old rows through.
  const current = state.query === query ? state : fresh(query)

  /**
   * ONE fetch path for the mount, the retry, a filter change and the realtime
   * reconcile. The generation guard is what a `cancelled` flag was for, and it
   * does more: a reconcile arriving while a retry is in flight can no longer
   * land out of order.
   */
  const generation = useRef(0)
  const fetchPage = useCallback(() => {
    const mine = ++generation.current
    void api.gigs.list(query).then(
      (page) => {
        if (mine === generation.current) {
          setState({ query, phase: 'ready', gigs: page.data, total: page.total })
        }
      },
      () => {
        if (mine === generation.current) {
          setState((previous) => ({ ...(previous.query === query ? previous : fresh(query)), phase: 'error' }))
        }
      },
    )
  }, [query])

  const retry = useCallback(() => {
    setState((previous) => ({ ...(previous.query === query ? previous : fresh(query)), phase: 'loading' }))
    fetchPage()
  }, [fetchPage, query])

  // The derived state is already `loading` for a new query, so the mount and
  // every filter change need the fetch only.
  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  /**
   * A frame the client was entitled to decide. The total moves by the
   * membership delta rather than being refetched — the row count is already
   * known and a round trip to learn "one more" is a round trip wasted.
   * Floored at zero: a page whose rows outnumber a total computed under
   * concurrent writes would otherwise print a negative count.
   */
  const applyItems = useCallback(
    (gigs: GigSummary[], membershipDelta: number) => {
      setState((previous) => {
        const base = previous.query === query ? previous : fresh(query)
        return {
          ...base,
          gigs,
          total: base.total === null ? null : Math.max(0, base.total + membershipDelta),
        }
      })
    },
    [query],
  )

  useGigFeedRealtime<GigSummary>({
    items: current.gigs,
    query,
    project: keepSummary,
    applyItems,
    // Client-fetched, so there is no second copy to refresh: reconciling means
    // asking for the list again, and only when the client could not decide.
    // Silently — a reader who has rows should not watch them blink because a
    // gig they cannot see changed.
    onReconcile: fetchPage,
  })

  return { phase: current.phase, gigs: current.gigs, total: current.total, retry }
}
