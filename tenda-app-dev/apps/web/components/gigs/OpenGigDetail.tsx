'use client'

/**
 * The /gigs/[id] pane: the SHARED listing composition (#49) for the open gig
 * the reader chose — this pane was a hand-kept copy of it once (#48), which
 * is exactly how the two drifted. Moved from /home in #60 with its
 * behaviour intact: the store read, the retry, the spinner-not-stale-gig rule.
 */
import { useCallback, useEffect } from 'react'
import { RotateCw } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useGigsStore } from '@/stores/gigs.store'
import { GigListingView } from '@/components/gig/detail/GigListingView'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import { AlertPanel, ALERT_ACTION_CLASS } from '@/components/ui/AlertPanel'
import { Spinner } from '@/components/ui/Spinner'

export function OpenGigDetail({ escrowId }: { escrowId: string }) {
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const selected = useGigsStore((state) => state.selectedGig)
  const error = useGigsStore((state) => state.error)
  const fetchGigDetail = useGigsStore((state) => state.fetchGigDetail)
  const load = useCallback(() => { void fetchGigDetail(escrowId) }, [escrowId, fetchGigDetail])
  useEffect(load, [load])
  const gig = selected?.escrow_id === escrowId ? selected : null

  if (gig === null && error?.id === escrowId) {
    return (
      <div className="p-6">
        <AlertPanel
          title={GIG_DETAIL_COPY.unavailableTitle}
          body={GIG_DETAIL_COPY.unavailableBody}
          action={<button type="button" onClick={load} className={ALERT_ACTION_CLASS}><RotateCw size={16} aria-hidden />{GIG_DETAIL_COPY.unavailableAction}</button>}
        />
      </div>
    )
  }
  if (gig === null) return <div className="flex h-full items-center justify-center"><Spinner /></div>
  return <GigListingView gig={gig} userId={userId} />
}
