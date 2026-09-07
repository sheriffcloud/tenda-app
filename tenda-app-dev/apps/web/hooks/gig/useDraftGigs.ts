/**
 * Web port of apps/mobile/hooks/useDraftGigs.ts: the caller's unfunded
 * draft gigs. One query shape shared by the two surfaces that need drafts
 * (My Gigs reads the count for its banner, /my-gigs/drafts renders rows).
 */
import { type EscrowStatus, type GigListQuery, type GigSummary } from '@tenda/shared'
import { api } from '@/api/client'
import { draftGigsCache } from '@/lib/account-state'
import { usePaginatedList } from '@/hooks/pagination/usePaginatedList'
import type { PaginatedListState } from '@/hooks/pagination/usePaginatedList'
import { useAuthStore } from '@/stores/auth.store'

const keyOf = (gig: GigSummary) => gig.escrow_id

const DRAFT_STATUSES: EscrowStatus[] = ['draft']

export function useDraftGigs(chainId: string | null = null): PaginatedListState<GigSummary> {
  const user = useAuthStore((s) => s.user)

  return usePaginatedList<GigSummary, GigListQuery>({
    fetchPage: (params) => api.gigs.list(params),
    query: { mine: 'created', status: DRAFT_STATUSES, chain_id: chainId ?? undefined },
    keyOf,
    cache: draftGigsCache,
    // `mine=` resolves identity from the JWT, but gating on the loaded user
    // keeps the request from firing before sign-in state settles.
    enabled: user?.id !== undefined,
  })
}
