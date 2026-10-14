/**
 * Web port of apps/mobile/hooks/useMyDisputes.ts: the caller's disputes
 * for one status bucket (open|resolved), paginated — the shared
 * controller's generation guard keeps a fast Open↔Resolved toggle safe.
 *
 * Mobile's focus-refresh has no web analogue ON PURPOSE: every mount reloads
 * page zero, so the stale-bucket problem cannot occur. Since #16 the list is a
 * workspace column that the router remounts on every row it opens, so that
 * reload is now SILENT — see `PAGE_ZERO` below.
 */
import { useCallback } from 'react'
import type { MyDisputeRow, MyDisputeStatus, MyDisputesQuery } from '@tenda/shared'
import { disputesPageCache } from '@/lib/account-state'
import { api } from '@/api/client'
import { usePaginatedList, type PaginatedListState } from '@/hooks/pagination/usePaginatedList'
import { useLiveList } from '@/hooks/workspace/useLiveList'

export type MyDisputesState = PaginatedListState<MyDisputeRow>

const keyOf = (row: MyDisputeRow) => row.dispute_id

/**
 * Page zero outlives the hook, because the @list slot is remounted on every
 * row the reader opens and a per-instance cache cannot survive that — the
 * column blinked through a skeleton each time. Page zero only, keyed by the
 * bucket, silently revalidated on every mount, so what it can serve is at most
 * one navigation stale.
 *
 * It lives in `lib/account-state` and NOT beside this hook: module scope
 * outlives the session as well as the component, and sign-out is a soft
 * navigation. A cache that no `logout` can empty is how the next account gets
 * shown the previous one's disputes.
 */

export function useMyDisputes(status: MyDisputeStatus): MyDisputesState {
  const list = usePaginatedList<MyDisputeRow, MyDisputesQuery>({
    fetchPage: (params) => api.disputes.mine(params),
    query: { status },
    keyOf,
    cache: disputesPageCache,
  })

  /**
   * A dispute raised, answered or resolved reaches this reader as a
   * notification and nothing more — no frame carries the ROW — so the bucket
   * asks the server again. Per bucket, because the column mounts both: an
   * inactive tab's count is a real total here too, and a resolution moves a row
   * from one bucket to the other, so refreshing only the visible one would
   * leave the other's chip wrong.
   */
  useLiveList(useCallback(() => { void list.reload() }, [list]))

  return list
}
