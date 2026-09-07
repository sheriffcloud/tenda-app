/**
 * Loads the caller's disputes for one status bucket (open|resolved), paginated.
 * Refetches whenever `status` changes, so a segmented toggle just swaps the
 * argument — the shared controller's generation guard is what keeps a fast
 * Open↔Resolved toggle (or a reload racing a toggle) safe: a superseded batch
 * can never overwrite the latest. That guard used to be hand-rolled here.
 *
 * No chain filter, deliberately: `MyDisputeRow` carries no `chain_id`, and a
 * dispute is about a counterparty rather than a settlement network — a chain
 * chip here would filter on data the row never shows.
 *
 * The list also re-reads page 0 on every LATER focus. This screen is a stack
 * route, but opening a dispute PUSHES the thread on top of it rather than
 * replacing it, so it is still mounted when you come back — and because the
 * list is status-BUCKETED, a stale row isn't merely outdated, it is in the
 * wrong bucket: a dispute resolved from the thread kept showing under "Open".
 */
import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import type { MyDisputeRow, MyDisputeStatus, MyDisputesQuery } from '@tenda/shared'
import { api } from '@/api/client'
import { usePaginatedList, type PaginatedListState } from '@/hooks/usePaginatedList'

export type MyDisputesState = PaginatedListState<MyDisputeRow>

const keyOf = (row: MyDisputeRow) => row.dispute_id

export function useMyDisputes(status: MyDisputeStatus): MyDisputesState {
  const list = usePaginatedList<MyDisputeRow, MyDisputesQuery>({
    fetchPage: (params) => api.disputes.mine(params),
    query: { status },
    keyOf,
  })

  // Mirrored into a ref so the focus callback's identity never changes when the
  // list settles — that would re-fire the effect and turn the first load into
  // two.
  const fetchedRef = useRef(false)
  fetchedRef.current = list.hasFetched

  useFocusEffect(
    useCallback(() => {
      // Page 0 is owned by the controller's query effect (mount, and each
      // Open↔Resolved toggle), so only a LATER focus re-reads here. `reload` is
      // the silent, preserve-loaded-pages variant: no spinner over a list the
      // user is already looking at, and no yank back to page 0 if they
      // scrolled. Reading the LIVE `status` is the controller's job — it holds
      // the query in a ref — so returning from a thread re-reads whichever
      // bucket is on screen, not the one that was active at mount.
      if (fetchedRef.current) void list.reload()
      // `list.reload` is stable (see usePaginatedList) and the flag is read
      // through a ref, so the callback deliberately has no deps — it must fire
      // on focus, not on every settled load.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  return list
}
