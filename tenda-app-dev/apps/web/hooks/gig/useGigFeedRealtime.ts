'use client'

/**
 * The gig feed's live wiring, for every surface that shows one.
 *
 * Both web surfaces that show one read the same `feed:gigs` broadcast (mobile
 * has its own hook over the same shared reducer) and must agree on what a
 * frame MEANS — which gig is newer, which one the reader's filters still
 * include, when the client may decide and when only the server can. That
 * agreement is `applyGigFeedEvent` in `@tenda/shared`; this hook is the
 * agreement about everything around it: seeding from the rendered page,
 * trimming to the page size, keeping a total honest, recording a revision even
 * when the frame is declined, and catching up when the socket is down.
 *
 * What legitimately differs is left to the caller, as two callbacks:
 *   - `project` — what this surface STORES. The anonymous feed keeps base
 *     units out of the payload it ships to the browser and holds a card model;
 *     the signed-in list renders the amount and holds the whole summary.
 *   - `onReconcile` — how this surface asks the server for the truth. The
 *     anonymous feed is server-rendered, so it refreshes the RSC tree; a
 *     client-fetched list refetches itself.
 *
 * It does NOT open the socket. A surface inside the workspace already has one
 * from the layout; the public page opens its own. Mounting a second lifecycle
 * here would fight whichever owns it.
 */
import { useEffect, useRef } from 'react'
import {
  applyGigFeedEvent,
  type GigFeedRecencyFields,
  type GigFeedServerFrame,
  type GigFeedState,
  type GigListQuery,
  type GigSummary,
} from '@tenda/shared'
import { useResyncWhileDisconnected } from '@/hooks/connectivity/useResyncWhileDisconnected'
import { useIsomorphicLayoutEffect } from '@/hooks/timing/useIsomorphicLayoutEffect'
import { subscribeGigFeedChannel } from '@/stores/realtime.store'

/** What the rendered page already told us about each row's version. */
interface Revisioned extends GigFeedRecencyFields {
  public_feed_revision: string
}

function revisionsFrom(items: readonly Revisioned[]): Readonly<Record<string, string>> {
  return Object.fromEntries(items.map((gig) => [gig.escrow_id, gig.public_feed_revision]))
}

/**
 * A page past the first cannot be reduced locally at all: what belongs on page
 * three depends on pages one and two, which no client holds. That is
 * pagination rather than membership, so the shared reducer is right not to
 * model it and the answer has to come from the server.
 */
function isLaterPage(query: GigListQuery): boolean {
  return query.cursor !== undefined || (query.offset ?? 0) > 0
}

/** The hook's parameter shape. Local: both callers pass an object literal, so
 *  exporting it would be a name nothing imports. */
interface GigFeedRealtimeArgs<T extends Revisioned> {
  /** The rows on screen now — the hook re-seeds from these on every render. */
  items: readonly T[]
  /** The query those rows answer; decides what a frame still matches. */
  query: GigListQuery
  project: (gig: GigSummary) => T
  /**
   * Rows changed, and the client was entitled to decide. `membershipDelta` is
   * -1, 0 or +1 for the surface's total.
   *
   * Deliberately NOT followed by `onReconcile`. A client-fetched list has one
   * copy of the rows and this call IS the update; a server-rendered page has a
   * second, now-stale copy, and reconciling it is that caller's business —
   * `usePublicGigFeedRealtime` does it from inside this callback. Doing it here
   * would make every frame a refetch for the surfaces that need none.
   */
  applyItems: (items: T[], membershipDelta: number) => void
  /** Ask the server; the client could not answer this one. */
  onReconcile: () => void
}

export function useGigFeedRealtime<T extends Revisioned>(args: GigFeedRealtimeArgs<T>): void {
  const argsRef = useRef(args)
  const stateRef = useRef<GigFeedState<T>>({
    items: args.items,
    revisions: revisionsFrom(args.items),
  })

  // LAYOUT, not passive (#46). The listener below runs outside React, so these
  // refs must already describe the committed render by the time any frame can
  // arrive. A passive effect is deferred past the commit, and a frame landing
  // in that gap was reduced against the previous list and an unseeded revision
  // map — dropping rows and applying superseded frames, because the staleness
  // guard only engages for a revision it already knows.
  useIsomorphicLayoutEffect(() => {
    argsRef.current = args
    // Rows come from the render; revisions ACCUMULATE. A row the server has
    // since dropped still has a revision worth remembering, or its late frame
    // replays as new.
    stateRef.current = {
      items: args.items,
      revisions: { ...stateRef.current.revisions, ...revisionsFrom(args.items) },
    }
  }, [args])

  useEffect(() => {
    return subscribeGigFeedChannel((event: GigFeedServerFrame) => {
      const current = argsRef.current
      const before = stateRef.current
      const wasVisible = before.items.some((gig) => gig.escrow_id === event.escrow_id)
      const laterPage = event.type === 'gig_available' && isLaterPage(current.query)
      const result = applyGigFeedEvent({
        state: before,
        event,
        query: current.query,
        project: current.project,
      })

      if (result.outcome === 'ignored_stale' || result.outcome === 'ignored_duplicate') return
      if (result.outcome === 'reconciliation_required' || laterPage) {
        // Record the revision even though the rows are the server's to decide.
        // The reducer leaves state untouched when it declines, and without this
        // the same frame would order a fresh reconcile every time it arrived.
        stateRef.current = {
          items: before.items,
          revisions: { ...before.revisions, [event.escrow_id]: event.gig_revision },
        }
        current.onReconcile()
        return
      }

      const limit = current.query.limit ?? result.state.items.length
      stateRef.current = { ...result.state, items: result.state.items.slice(0, limit) }
      const isVisible = stateRef.current.items.some((gig) => gig.escrow_id === event.escrow_id)
      // Measured against the TRIMMED list, which makes this a page-visibility
      // delta — and callers add it to a SET total. Those are the same number
      // except in one case: a gig that rejoins the set carrying an old
      // `created_at` (un-hiding a taken-down listing does this) sorts below a
      // full page, so it is a new member the page cannot show and the delta
      // reads 0. The client genuinely cannot tell that from an update to a row
      // that was always off-page, and guessing would double-count; the total
      // lags by one until the next reconcile instead. Reconciling on every
      // eviction would refetch on nearly every frame once the set outgrows a
      // page, which is the worse trade. Pinned by "does not move the total for
      // a member the page has no room for".
      current.applyItems([...stateRef.current.items], Number(isVisible) - Number(wasVisible))
    })
  }, [])

  useResyncWhileDisconnected(() => argsRef.current.onReconcile())
}
