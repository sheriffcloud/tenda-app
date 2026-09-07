'use client'

/**
 * The authed half of /gig/[id] — web port of mobile's gig detail screen
 * content. The SSR page renders the anonymous listing; this island, once a
 * session exists, refetches the SAME endpoint with the bearer (adding the
 * party-scoped half: viewer block, counterparty, proofs, hidden flag) and
 * renders the party content plus the action machine. Anonymous visitors keep
 * the sign-in CTA.
 *
 * The machine itself lives in `GigEscrowActions`, because the workspace
 * dossier renders the party CONTENT itself and needs the actions alone.
 */
import { useCallback, useEffect } from 'react'
import { type GigDetail } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { useGigsStore } from '@/stores/gigs.store'
import { useEscrowLiveRefresh } from '@/hooks/escrow/live'
import { GigDetailCta, type PublicGigCta } from '@/components/gig/GigDetailCta'
import { GigEscrowActions } from './GigEscrowActions'
import { PartyPanel } from './PartyPanel'
import { TakedownNotice } from './TakedownNotice'

export function GigDetailAuthed({ gig, userId }: { gig: GigDetail; userId: string }) {
  return (
    <div className="flex flex-col gap-4">
      {/* The party-scoped CONTENT the public page's anonymous body has no way
          to show, then the actions. The workspace dossier renders this content
          itself and composes `GigEscrowActions` alone. */}
      <TakedownNotice escrow={gig} subject="gig" viewerId={userId} />
      <PartyPanel gig={gig} userId={userId} />
      <GigEscrowActions gig={gig} userId={userId} />
    </div>
  )
}

/**
 * Session-aware wrapper. The SSR/anonymous render is the sign-in CTA (what
 * the server sent); once a session loads, the bearer refetch swaps in the
 * party-scoped detail. `gone` after a refetch (deleted / taken down for this
 * viewer) drops the detail, so the island renders nothing and the page keeps
 * only the static SSR listing — no dead action buttons, no anonymous CTA
 * flashing at a signed-in user.
 */
export interface PublicGigInitial extends PublicGigCta {
  escrow_id: string
}

export function GigDetailApp({ initial }: { initial: PublicGigInitial }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const loadSession = useAuthStore((s) => s.loadSession)
  const isLoading = useAuthStore((s) => s.isLoading)
  const selectedGig = useGigsStore((s) => s.selectedGig)
  const fetchGigDetail = useGigsStore((s) => s.fetchGigDetail)

  // The public page mounts outside the authed layout, so bootstrap the
  // session here (idempotent — resolves from the stored token).
  useEffect(() => {
    if (isLoading) void loadSession()
  }, [isLoading, loadSession])

  const refetch = useCallback(() => {
    void fetchGigDetail(initial.escrow_id)
  }, [fetchGigDetail, initial.escrow_id])

  useEffect(() => {
    if (isAuthenticated) refetch()
  }, [isAuthenticated, refetch])

  const gig = selectedGig?.escrow_id === initial.escrow_id ? selectedGig : null

  // Live-update when the counterparty acts (accept / submit / approve), not
  // just on load — the escrow WS channel drives the refetch (mobile parity).
  // Inert until the bearer detail lands (escrowId undefined-gated inside).
  useEscrowLiveRefresh(gig?.escrow_id, refetch, gig?.status ?? 'draft')

  if (!isAuthenticated || userId === null) return <GigDetailCta gig={initial} />
  // Authed but the bearer refetch hasn't landed: render nothing rather than
  // the anonymous CTA flashing "Sign in to accept" at a signed-in user.
  if (gig === null) return null
  return <GigDetailAuthed gig={gig} userId={userId} />
}
