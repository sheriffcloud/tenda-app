/**
 * The caller's unfunded draft gigs.
 *
 * Extracted from `useMyGigs` so the two surfaces that need drafts cannot drift
 * on what a draft list IS: My Gigs reads the count for its banner, and the
 * drafts screen renders the rows. One query shape, one auth gate.
 */
import { type EscrowStatus, type GigListQuery, type GigSummary } from '@tenda/shared'
import { api } from '@/api/client'
import { usePaginatedList, type PaginatedListState } from '@/hooks/usePaginatedList'
import { useAuthStore } from '@/stores/auth.store'

const keyOf = (gig: GigSummary) => gig.escrow_id

// Module scope: `query` identity is compared by JSON shape, so a fresh array
// per render is harmless but pointless churn.
const DRAFT_STATUSES: EscrowStatus[] = ['draft']

/**
 * @param chainId CAIP-2 chain to scope to, or null for every chain. My Gigs
 *   passes null on purpose — see the banner's note in `useMyGigs`.
 */
export function useDraftGigs(chainId: string | null = null): PaginatedListState<GigSummary> {
  const user = useAuthStore((s) => s.user)

  return usePaginatedList<GigSummary, GigListQuery>({
    fetchPage: (params) => api.gigs.list(params),
    query: { mine: 'created', status: DRAFT_STATUSES, chain_id: chainId ?? undefined },
    keyOf,
    // `mine=` resolves identity from the JWT, but gating on the loaded user
    // keeps the request from firing before sign-in state settles.
    enabled: user?.id !== undefined,
  })
}
