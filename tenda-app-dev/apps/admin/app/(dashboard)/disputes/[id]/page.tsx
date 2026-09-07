'use client'

/**
 * Dispute detail + mediation thread (#91). Routed by DISPUTE id; the
 * summary fetch supplies the escrow id the thread rides on.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import type { DisputeSummary } from '@tenda/shared'
import { AppHeader } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { ClaimActions } from '@/components/disputes/claim-actions'
import { AssigneeBadge } from '@/components/disputes/assignee-badge'
import { ThreadView } from '@/components/disputes/thread-view'
import { DossierPanel } from '@/components/disputes/dossier'
import { ResolutionPanel } from '@/components/disputes/resolution'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { useSessionUser } from '@/lib/use-session'
import { useEscrowDossier } from '@/hooks/use-dossier'

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>()
  const disputeId = params.id
  const [dispute, setDispute] = useState<DisputeSummary | null>(null)
  const [notFound, setNotFound] = useState(false)
  const meId = useSessionUser()?.id ?? ''
  const { dossier } = useEscrowDossier(dispute?.escrow_id ?? null)

  // setState lives in the .then callbacks (react-hooks/set-state-in-effect);
  // refreshKey bumps re-run the fetch after claim/release/resolution.
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  // The thread poll back-feeds the assignee; the ref lets onAssignee make
  // its decisions OUTSIDE the state updater (updaters must stay pure) and
  // bail out without a re-render when nothing changed.
  const knownRef = useRef<{ assignedToId: string | null; resolved: boolean }>({
    assignedToId: null,
    resolved: false,
  })

  useEffect(() => {
    let alive = true
    adminApi.disputes
      .get(disputeId)
      .then((summary) => {
        if (!alive) return
        knownRef.current = {
          assignedToId: summary.assigned_to_id,
          resolved: summary.resolved_at !== null,
        }
        setDispute(summary)
      })
      .catch((err: unknown) => {
        if (!alive) return
        if (err instanceof ApiError && err.status === 404) setNotFound(true)
        else toast.error(err instanceof ApiError ? err.message : 'Failed to load dispute')
      })
    return () => {
      alive = false
    }
  }, [disputeId, refreshKey])

  // The thread poll is the freshest assignee source — mirror it locally so
  // the claim button flips without a manual refresh. When the thread
  // reports a resolution we don't know about yet, refetch the summary
  // (it carries winner, resolved_at AND the resolver's name, none of which
  // the thread knows — never synthesize them).
  const onAssignee = useCallback(
    (assignedToId: string | null, readOnly: boolean) => {
      const known = knownRef.current
      if (readOnly && !known.resolved) {
        knownRef.current = { ...known, resolved: true }
        refresh()
        return // the refetch carries the assignee too
      }
      if (assignedToId !== known.assignedToId) {
        // Refetch rather than patch: the thread carries the assignee's ID but
        // not their NAME, so patching in place would pair the new mediator's
        // id with the previous mediator's name and confidently name the wrong
        // person. Updating knownRef first stops the poll re-triggering the
        // refetch while it is still in flight.
        knownRef.current = { ...known, assignedToId }
        refresh()
      }
    },
    [refresh],
  )

  if (notFound) {
    return (
      <>
        <AppHeader title="Dispute" />
        <p className="p-6 text-sm text-muted-foreground">
          Dispute not found. <Link href="/disputes" className="underline">Back to the queue</Link>
        </p>
      </>
    )
  }
  if (dispute === null) {
    return (
      <>
        <AppHeader title="Dispute" />
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      </>
    )
  }

  const resolved = dispute.resolved_at !== null
  return (
    <>
      <AppHeader title={dispute.subject_title ?? 'Exchange dispute'} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <Badge variant="outline" className="capitalize">{dispute.kind}</Badge>
          <AssigneeBadge dispute={dispute} meId={meId} />
          <p className="flex-1 truncate text-sm text-muted-foreground">{dispute.reason}</p>
          <ClaimActions
            disputeId={dispute.dispute_id}
            assignedToId={dispute.assigned_to_id}
            resolved={resolved}
            meId={meId}
            onChanged={refresh}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <div className="flex flex-col gap-4 lg:w-[380px] lg:shrink-0 lg:overflow-y-auto">
            <ResolutionPanel
              disputeId={dispute.dispute_id}
              kind={dispute.kind}
              canPropose={dispute.assigned_to_id === meId && !resolved}
            />
            {dossier !== null ? (
              <DossierPanel dossier={dossier} />
            ) : (
              <p className="text-sm text-muted-foreground">Loading context…</p>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <ThreadView
              escrowId={dispute.escrow_id}
              onAssignee={onAssignee}
              kind={dispute.kind}
              parties={dossier?.parties ?? []}
            />
          </div>
        </div>
      </div>
    </>
  )
}
