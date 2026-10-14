'use client'

/**
 * The authed escrow detail — the workspace's dossier pane (Tier 2 comp,
 * lines 497-713), and the surface `EscrowDossier` was built for in #9.
 *
 * WHY A SECOND URL EXISTS FOR ONE ESCROW (user decision, 2026-08-17). The
 * public `/gig/[id]` stays the canonical, indexable, unfurlable address: it
 * server-renders the listing anonymously and its client island adds the party
 * half once a bearer loads. That page belongs to the PUBLIC shell, so a reader
 * who opened a gig from their own list left the workspace and the list column
 * went with them — a column that vanishes when you use it is not a column.
 *
 * The rules that keep the two from drifting:
 *   - both read the SAME endpoint through the same store, and the party half
 *     comes from the server's scoping, never from a local role check;
 *   - both render the same action island (`GigDetailAuthed`), so a transition
 *     offered here is the same one offered there;
 *   - this one is authed-only. `AuthGate` sends a signed-out visitor to
 *     /signin before this page renders at all, so nothing here is public and
 *     nothing crawls it. The address to SHARE is the public one; a
 *     /my-gigs/<id> link handed to someone signed out lands them on sign-in;
 *     the auth return-path then restores this destination after verification.
 */
import { useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { escrowPartiesOf, isParty } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { useGigsStore } from '@/stores/gigs.store'
import { useEscrowLiveRefresh } from '@/hooks/escrow/live'
import { DisputeNotice } from '@/components/escrow/DisputeNotice'
import { EscrowDossier } from '@/components/escrow/dossier'
import { GigListingView } from '@/components/gig/detail/GigListingView'
import { GigEscrowActions } from '@/components/gig/detail/GigEscrowActions'
import { gigCounterpartyView } from '@/components/gig/detail/party-view'
import Link from 'next/link'
import { RotateCw } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { ALERT_ACTION_CLASS, AlertPanel } from '@/components/ui/AlertPanel'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import { MY_GIGS_COPY } from '@/components/gig/my-gigs/copy'
import { TakedownNotice } from '@/components/gig/detail/TakedownNotice'
import { dossierProofsFor } from '@/components/escrow/dossier'
import { dossierFactsFor } from '@/components/gig/my-gigs/dossier-facts'
import { GigReviews } from '@/components/gig/detail/GigReviews'

export default function MyGigDetailPage() {
  const { escrowId } = useParams<{ escrowId: string }>()
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const gig = useGigsStore((s) => s.selectedGig)
  const loadError = useGigsStore((s) => s.error)
  const fetchGigDetail = useGigsStore((s) => s.fetchGigDetail)

  const refetch = useCallback(() => {
    void fetchGigDetail(escrowId)
  }, [fetchGigDetail, escrowId])

  useEffect(() => {
    if (isAuthenticated) refetch()
  }, [isAuthenticated, refetch])

  // The public page follows the escrow's WS channel so the CTA bar stops
  // offering what the counterparty has already done. This pane needs it for
  // the same reason and had it for none — composing the ACTIONS alone left the
  // live refresh behind in the wrapper that owns the public page's fetch.
  // Inert until the detail lands (the hook is id-gated inside).
  useEscrowLiveRefresh(
    gig?.escrow_id === escrowId ? gig.escrow_id : undefined,
    refetch,
    gig?.escrow_id === escrowId ? gig.status : 'draft',
  )

  if (!isAuthenticated) return null

  // The store holds ONE selected gig; while a different one is still in it the
  // pane must not render the previous escrow's money under this one's URL.
  const current = gig?.escrow_id === escrowId ? gig : null

  // A failed read is a STATE, not an absence. Without this the pane spun for
  // ever on a 404, a takedown or a dropped connection — found by opening a gig
  // the stub has no detail for (#17 review). `gone` and transient say the same
  // thing to the reader here: this one cannot be read, try again or go back to
  // the list. Which of the two it was is the server's business.
  if (current === null && loadError?.id === escrowId) {
    return (
      <div className="px-9 py-10">
        <AlertPanel
          title={GIG_DETAIL_COPY.unavailableTitle}
          body={GIG_DETAIL_COPY.unavailableBody}
          action={
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" onClick={refetch} className={ALERT_ACTION_CLASS}>
                <RotateCw size={16} aria-hidden />
                {GIG_DETAIL_COPY.unavailableAction}
              </button>
              <Link
                href="/my-gigs"
                className="mt-5 text-sm font-semibold text-feedback-danger-text underline"
              >
                {MY_GIGS_COPY.backToList}
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  if (current === null) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <Spinner />
      </div>
    )
  }

  // Relationship, not URL, picks the composition (#49). The dossier is party
  // furniture — money block, timeline, counterparty — and carries no brief, so
  // a viewer who is NOT a party (a subscriber opening a new-gig notice, an
  // applicant from the Applied tab) gets the SAME listing body /gigs
  // renders: the brief they came to read, with the shared CTA branches still
  // offering accept/apply. This is what lets every gig notification target
  // this one URL. The wire makes the test safe: `counterparty` is served
  // non-null only to parties.
  if (userId !== null && !isParty(escrowPartiesOf(current), userId)) {
    return <GigListingView gig={current} userId={userId} />
  }

  // The OTHER party from this viewer's seat — the same helper PartyPanel
  // uses (#51), so the dossier's card and /gig/[id]'s agree on who is shown.
  const counterpartyView = gigCounterpartyView(current, userId ?? '')

  return (
    <EscrowDossier
      title={current.title}
      amountRaw={current.amount_raw}
      asset={current.asset}
      escrow={current}
      facts={dossierFactsFor(current)}
      counterparty={counterpartyView?.user ?? null}
      counterpartyLabel={counterpartyView?.label}
      viewerId={userId ?? ''}
      chatContext={{ id: current.escrow_id, title: current.title, kind: 'gig' }}
      proofs={dossierProofsFor(current.proofs)}
      isAssigned={current.is_assigned}
      // Mobile bakes the dispute affordance into the detail; this pane is
      // where a dispute notification LANDS a party (#49), so it must too.
      // This branch renders only for parties, hence isParty.
      dispute={
        current.dispute !== null && current.status === 'disputed' ? (
          <DisputeNotice
            reason={current.dispute.reason}
            escrowId={current.escrow_id}
            isParty
          />
        ) : null
      }
      // Renders nothing when the escrow is visible, and the SHARED copy
      // derivation decides which audience's wording a party sees.
      banner={userId === null ? undefined : (
        <TakedownNotice escrow={current} subject="gig" viewerId={userId} />
      )}
    >
      {/* The ACTIONS only. This pane already renders the party content above
          — the money block, the timeline, the counterparty, the proofs — and
          composing the whole authed island printed the takedown banner twice
          (measured) and would have doubled every proof. */}
      {userId !== null && <GigEscrowActions gig={current} userId={userId} />}
      <GigReviews gig={current} revealParties />
    </EscrowDossier>
  )
}
