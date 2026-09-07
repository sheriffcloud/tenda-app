/**
 * The caller's own exchange escrows — offers posted (creator) and offers
 * accepted (counterparty) — from `/v1/users/:id/escrows?kind=exchange`.
 *
 * Extracted from `useExchangeScreen` (#60) so the /home dashboard's "Active
 * trades" card reads the SAME list, cache and query the Trade surface does,
 * without also fetching the public order book it has no use for.
 */
import type { EscrowListRow, UserEscrowsQuery } from '@tenda/shared'
import { api } from '@/api/client'
import { usePaginatedList, type PaginatedListState } from '@/hooks/pagination/usePaginatedList'
import { useAuthStore } from '@/stores/auth.store'
import { myTradesCache } from '@/lib/account-state'

const escrowKey = (row: EscrowListRow) => row.id

export function useMyTrades(
  chainId: string | null = null,
  enabled = true,
): PaginatedListState<EscrowListRow> {
  const user = useAuthStore((s) => s.user)
  const userId = user?.id ?? null
  return usePaginatedList<EscrowListRow, UserEscrowsQuery>({
    // No role filter → both sides: offers posted (creator) and offers
    // accepted (counterparty). The row derives selling/buying from creator_id.
    fetchPage: (params) => api.users.escrows({ id: userId ?? '' }, params),
    query: { kind: 'exchange', chain_id: chainId ?? undefined },
    keyOf: escrowKey,
    // Never issue the request without an id — it would 403 on someone
    // else's escrows rather than simply not running.
    enabled: enabled && userId !== null,
    cache: myTradesCache,
  })
}
