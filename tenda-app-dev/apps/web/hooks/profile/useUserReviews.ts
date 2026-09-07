/**
 * A user's public reviews, paged.
 *
 * A thin wrapper over `usePaginatedList` like every other list on web
 * (useMyGigs, useDraftGigs, useMyDisputes): it brings the shared PAGE_SIZE,
 * offset arithmetic, `mergeById` de-duplication and error handling with it,
 * so a review landing between two pages cannot show up twice.
 *
 * The reviews are PUBLIC on purpose — a deliberate exemption from party
 * scoping — and the endpoint serves bare rows, so nothing here is scoped to
 * the viewer.
 */
import type { Review } from '@tenda/shared'
import { api } from '@/api/client'
import { usePaginatedList } from '@/hooks/pagination/usePaginatedList'
import type { PaginatedListState } from '@/hooks/pagination/usePaginatedList'

const keyOf = (review: Review) => review.id

export function useUserReviews(userId: string): PaginatedListState<Review> {
  return usePaginatedList<Review, Record<string, never>>({
    fetchPage: (params) =>
      api.users.reviews({ id: userId }, { limit: params.limit, offset: params.offset }),
    query: {},
    keyOf,
    enabled: userId !== '',
  })
}
