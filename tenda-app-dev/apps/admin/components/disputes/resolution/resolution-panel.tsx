'use client'

import { hasPermission, winnerLabel, type EscrowKind, type AdminResolutionView } from '@tenda/shared'
import { Badge } from '@/components/ui/badge'
import { useSessionUser } from '@/lib/use-session'
import { useResolution } from '@/hooks/use-resolution'
import { ProposeForm } from './propose-form'
import { RejectAction } from './reject-action'
import { SignAction } from './sign-action'
import { ReownBoundary } from '@/providers/reown/boundary'

const ACTIVE = new Set(['pending', 'executing'])

function ActiveProposal({
  resolution,
  kind,
  canExecute,
  onChanged,
}: {
  resolution: AdminResolutionView
  kind: EscrowKind
  canExecute: boolean
  onChanged: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{winnerLabel(kind, resolution.proposed_winner)}</span>
        <Badge variant="secondary">awaiting signature</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        A key-holder signs this on-chain to release the funds.
      </p>
      {canExecute && (
        <div className="flex flex-col gap-2">
          <ReownBoundary>
            <SignAction
              resolutionId={resolution.id}
              chainId={resolution.chain_id}
              authority={resolution.dispute_admin_authority}
              onSigned={onChanged}
            />
          </ReownBoundary>
          <RejectAction resolutionId={resolution.id} onRejected={onChanged} />
        </div>
      )}
    </div>
  )
}

/**
 * Resolution workflow for a dispute (Issue-3 C1): shows the current proposal
 * and the propose / reject controls the caller is entitled to. The on-chain
 * signing surface (C2) plugs into the "awaiting signature" state.
 */
export function ResolutionPanel({
  disputeId,
  kind,
  canPropose,
}: {
  disputeId: string
  kind: EscrowKind
  /** Caller holds the claim and the dispute is unresolved. */
  canPropose: boolean
}) {
  const role = useSessionUser()?.role ?? ''
  const canExecute = hasPermission(role, 'disputes.execute')
  const { resolution, loading, error, reload } = useResolution(disputeId)

  let body: React.ReactNode
  if (loading) {
    body = <p className="text-sm text-muted-foreground">Loading resolution…</p>
  } else if (error !== null) {
    body = <p className="text-sm text-destructive">{error}</p>
  } else if (resolution !== null && ACTIVE.has(resolution.status)) {
    body = (
      <ActiveProposal resolution={resolution} kind={kind} canExecute={canExecute} onChanged={reload} />
    )
  } else if (resolution !== null && resolution.status === 'confirmed') {
    body = (
      <div className="flex items-center gap-2">
        <Badge>resolved · {winnerLabel(kind, resolution.proposed_winner)}</Badge>
      </div>
    )
  } else {
    // No active proposal: either none yet, or the last one was rejected.
    body = (
      <div className="space-y-2">
        {resolution !== null && resolution.status === 'rejected' && (
          <p className="text-xs text-muted-foreground">
            Previous proposal rejected{resolution.reject_reason !== null ? ` — ${resolution.reject_reason}` : ''}.
          </p>
        )}
        {canPropose ? (
          <ProposeForm disputeId={disputeId} kind={kind} onProposed={reload} />
        ) : (
          <p className="text-sm text-muted-foreground">No resolution proposed yet.</p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-md border p-4">
      <p className="mb-2 text-sm font-medium">Resolution</p>
      {body}
    </div>
  )
}
