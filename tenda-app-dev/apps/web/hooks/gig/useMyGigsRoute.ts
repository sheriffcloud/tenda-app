'use client'

/**
 * The My Gigs column's state, read from the URL.
 *
 * Both keys live there because the @list slot is REMOUNTED whenever the route
 * moves between its entries — i.e. on every gig the reader opens — so anything
 * held in component state resets at exactly the wrong moment: the filter they
 * set, and the tab whose row they just clicked.
 *
 * `openEscrowId` is the selection: the id in the path when a gig is open, and
 * null on the surface itself. It is what the column marks.
 */
import { useParams, useSearchParams } from 'next/navigation'
import { myGigsTab, type MyGigsTab } from '@/components/gig/my-gigs/tabs'

export interface MyGigsRoute {
  tab: MyGigsTab
  chainId: string | null
  openEscrowId: string | null
}

export function useMyGigsRoute(): MyGigsRoute {
  const search = useSearchParams()
  const params = useParams<{ escrowId?: string }>()
  return {
    tab: myGigsTab(search.get('mine')),
    chainId: search.get('chain'),
    openEscrowId: params.escrowId ?? null,
  }
}
