/**
 * Web port of apps/mobile/hooks/useMyGigs.ts: the caller's Posted,
 * Working, Drafts and Applications lists, each independently paginated.
 *
 * The chain filter arrives as an ARGUMENT rather than living here, because the
 * list is a workspace column now and the router remounts it on every row it
 * opens — local state would snap back to "all chains" each time. It rides the
 * URL, where a remount can still read it.
 *
 * Drafts are their OWN list (never rows mixed into Posted): "Posted" is
 * POSTED_ESCROW_STATUSES exactly, so its count chip can never be inflated
 * by pre-signature staging rows. Drafts feed a banner above Posted that
 * links to /my-gigs/drafts. ALL lists load on mount so inactive tabs'
 * count chips read a real server `total`, never a zero for an unfetched
 * list. Mobile's focus refresh has no web analogue (pages remount on
 * navigation). Applications are deliberately NOT chain-filtered:
 * /v1/applications is caller-scoped with no chain parameter.
 */
import { useCallback } from 'react'
import {
  POSTED_ESCROW_STATUSES,
  type EscrowStatus,
  type GigListQuery,
  type GigSummary,
  type MyApplication,
} from '@tenda/shared'
import { api } from '@/api/client'
import { usePaginatedList, type PaginatedListState } from '@/hooks/pagination/usePaginatedList'
import { useDraftGigs } from '@/hooks/gig/useDraftGigs'
import { useLiveList } from '@/hooks/workspace/useLiveList'
import { useAuthStore } from '@/stores/auth.store'
import { myApplicationsCache, postedGigsCache, workingGigsCache } from '@/lib/account-state'

export interface MyGigsState {
  /** Gigs the caller posted on-chain — every status except `draft`. */
  posted: PaginatedListState<GigSummary>
  working: PaginatedListState<GigSummary>
  /** Unfunded staging rows — consumed here for the banner's `total`. */
  drafts: PaginatedListState<GigSummary>
  applications: PaginatedListState<MyApplication>
}

const keyOf = (gig: GigSummary) => gig.escrow_id
// The APPLICATION id, not the gig's: keying on the gig would collide the
// moment the same list carries a withdrawn row and its re-application.
const applicationKeyOf = (row: MyApplication) => row.application.id

const EMPTY_QUERY: Record<string, never> = {}
const POSTED_STATUSES: EscrowStatus[] = [...POSTED_ESCROW_STATUSES]

export function useMyGigs(chainId: string | null = null): MyGigsState {
  const user = useAuthStore((s) => s.user)

  const enabled = user?.id !== undefined

  const posted = usePaginatedList<GigSummary, GigListQuery>({
    fetchPage: (params) => api.gigs.list(params),
    query: { mine: 'created', status: POSTED_STATUSES, chain_id: chainId ?? undefined },
    keyOf,
    enabled,
    cache: postedGigsCache,
  })

  const working = usePaginatedList<GigSummary, GigListQuery>({
    fetchPage: (params) => api.gigs.list(params),
    query: { mine: 'working', chain_id: chainId ?? undefined },
    keyOf,
    enabled,
    cache: workingGigsCache,
  })

  // NOT chain-filtered: the banner's only job is "you have unfunded work
  // sitting here" — a chain-scoped count would make it vanish under a chip.
  const drafts = useDraftGigs()

  const applications = usePaginatedList<MyApplication, Record<string, never>>({
    fetchPage: (params) => api.applications.mine(params),
    query: EMPTY_QUERY,
    keyOf: applicationKeyOf,
    enabled,
    cache: myApplicationsCache,
  })

  /**
   * All four, on one signal. An inactive tab's count chip is a real server
   * total (see this file's header), so leaving three of them stale would put a
   * wrong number on screen rather than merely an old list — and the reader
   * cannot tell a stale chip from a true one.
   *
   * Silent by construction: `reload` is `usePaginatedList`'s no-spinner mode,
   * so nothing blinks while this runs.
   */
  useLiveList(
    useCallback(() => {
      void posted.reload()
      void working.reload()
      void drafts.reload()
      void applications.reload()
    }, [posted, working, drafts, applications]),
  )

  return { posted, working, drafts, applications }
}
