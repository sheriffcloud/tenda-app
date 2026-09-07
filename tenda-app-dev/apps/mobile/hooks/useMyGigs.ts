/**
 * My-Gigs controller: the caller's Posted, Working and Applied listings, each
 * independently paginated, plus the shared chain filter and the drafts count.
 *
 * Drafts are their OWN list rather than rows mixed into Posted. `mine=created`
 * returns every status including `draft`, so a single list forced a choice
 * between showing drafts and counting them (a pre-signature staging row is not
 * a posted gig). Splitting the query lets each tab's chip stay exactly its own
 * server `total` — no derived arithmetic, no extra count request, and no chip
 * that disagrees with the rows under it.
 *
 * Drafts no longer occupy a TAB, only a banner above Posted that links to
 * /my-gigs/drafts. Four tabs could not fit a label plus a multi-digit count
 * chip on a narrow screen, and drafts were the right tab to give up: a staging
 * state users pass through, not a listing they browse. The split query above is
 * unchanged — it now feeds a count and a separate screen instead of a tab.
 *
 * ALL lists load on mount rather than only the active tab. That is what
 * fixes the inactive tab's count chip reading 0 until it was swiped to
 * (open_issues MB2) — the chips now read the server `total` for a list that
 * has actually been fetched, instead of the length of an array nobody
 * populated. `total` also stays correct once the list pages, where
 * `items.length` would mean "loaded so far".
 *
 * All lists also re-read page 0 on every LATER focus. My Gigs is a tab, so it
 * stays mounted for the rest of the session: without this, posting a gig,
 * accepting one, or deleting a draft left both the rows AND the count chips
 * (which read the server `total`) showing pre-action state indefinitely.
 * Publishing a draft moves a row BETWEEN two of these lists, so the refresh
 * has to cover every one of them, not just the visible tab.
 */
import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  POSTED_ESCROW_STATUSES,
  type EscrowStatus,
  type GigListQuery,
  type GigSummary,
  type MyApplication,
} from '@tenda/shared'
import { api } from '@/api/client'
import { usePaginatedList, type PaginatedListState } from '@/hooks/usePaginatedList'
import { useDraftGigs } from '@/hooks/useDraftGigs'
import { useAuthStore } from '@/stores/auth.store'

export interface MyGigsState {
  /** Gigs the caller posted on-chain — every status except `draft`. */
  posted: PaginatedListState<GigSummary>
  working: PaginatedListState<GigSummary>
  /**
   * Unfunded staging rows. Consumed here for its `total` (the banner) — the
   * rows themselves are rendered by /my-gigs/drafts, which builds its own
   * chain-filtered list from the same `useDraftGigs` definition.
   */
  drafts: PaginatedListState<GigSummary>
  /**
   * Approval-mode applications the caller has sent. Their own list because an
   * application is not a gig the caller holds — the poster may still pick
   * someone else — and because D5 makes the live countdown to `expires_at` the
   * applicant's responsibility to watch.
   *
   * Deliberately NOT chain-filtered: the filter chips scope gigs by settlement
   * chain, and `/v1/applications` is caller-scoped with no chain parameter.
   * Silently ignoring the active chip would be worse than not applying it.
   */
  applications: PaginatedListState<MyApplication>
  chainId: string | null
  setChainId: (chain_id: string | null) => void
}

const keyOf = (gig: GigSummary) => gig.escrow_id
// The APPLICATION id, not the gig's: an applicant can hold at most one row per
// gig, but keying on the gig would collide the moment the same list carries a
// withdrawn row and its re-application.
const applicationKeyOf = (row: MyApplication) => row.application.id

// Module scope so the query object's identity is stable; usePaginatedList
// compares by JSON shape, and an empty literal per render would be pure churn.
const EMPTY_QUERY: Record<string, never> = {}

// Spread once at module scope: `query` identity is compared by JSON shape, so
// a fresh array per render is fine, but there is no reason to build one.
const POSTED_STATUSES: EscrowStatus[] = [...POSTED_ESCROW_STATUSES]

export function useMyGigs(): MyGigsState {
  const user = useAuthStore((s) => s.user)
  const [chainId, setChainId] = useState<string | null>(null)

  // `mine=` resolves identity from the JWT, but gating on the loaded user
  // keeps the request from firing before sign-in state settles.
  const enabled = user?.id !== undefined

  const posted = usePaginatedList<GigSummary, GigListQuery>({
    fetchPage: (params) => api.gigs.list(params),
    query: { mine: 'created', status: POSTED_STATUSES, chain_id: chainId ?? undefined },
    keyOf,
    enabled,
  })

  const working = usePaginatedList<GigSummary, GigListQuery>({
    fetchPage: (params) => api.gigs.list(params),
    query: { mine: 'working', chain_id: chainId ?? undefined },
    keyOf,
    enabled,
  })

  // Deliberately NOT chain-filtered, unlike posted/working. This list no longer
  // backs a tab — it backs a banner whose only job is "you have unfunded work
  // sitting here". A chain-scoped count would make that banner vanish when the
  // user flips a chip, which reads as "my drafts are gone" rather than "the
  // filter excluded them". The drafts SCREEN carries its own chip row for
  // narrowing.
  const drafts = useDraftGigs()

  const applications = usePaginatedList<MyApplication, Record<string, never>>({
    fetchPage: (params) => api.applications.mine(params),
    query: EMPTY_QUERY,
    keyOf: applicationKeyOf,
    enabled,
  })

  // Mirrored into refs so the focus callback's identity never changes when a
  // list settles — that would re-fire the effect and turn the first load into
  // two, which is the double-fetch this screen was just cleaned of.
  const postedFetchedRef = useRef(false)
  postedFetchedRef.current = posted.hasFetched
  const workingFetchedRef = useRef(false)
  workingFetchedRef.current = working.hasFetched
  const draftsFetchedRef = useRef(false)
  draftsFetchedRef.current = drafts.hasFetched
  const applicationsFetchedRef = useRef(false)
  applicationsFetchedRef.current = applications.hasFetched

  useFocusEffect(
    useCallback(() => {
      // Page 0 is owned by each controller's query effect (mount, gate opening,
      // chain-filter change), so only a LATER focus re-reads here. `reload` is
      // the silent, preserve-loaded-pages variant: no spinner over a list the
      // user is already looking at, and no yank back to page 0 if they scrolled.
      if (postedFetchedRef.current) void posted.reload()
      if (workingFetchedRef.current) void working.reload()
      // Drafts too: publishing one moves it out of this list and into Posted,
      // so a stale count would keep the banner advertising a gig already live —
      // or keep the banner up at all once the last draft is published.
      if (draftsFetchedRef.current) void drafts.reload()
      // Applications too: being assigned flips a row to `assigned` and puts
      // the gig in Working, so a stale tab would show the applicant still
      // waiting on a decision that has already been made.
      if (applicationsFetchedRef.current) void applications.reload()
      // Every `reload` is stable (see usePaginatedList) and the flags are read
      // through refs, so the callback deliberately has no deps — it must fire
      // on focus, not on every settled load.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  // `setChainId` is React's own setter — already stable, so it is returned
  // directly rather than re-wrapped (matching useExchangeScreen).
  return { posted, working, drafts, applications, chainId, setChainId }
}
