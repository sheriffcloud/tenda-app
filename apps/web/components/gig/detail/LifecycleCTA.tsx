'use client'

/**
 * Draws ONE lifecycle branch — web twin of mobile's LifecycleCTA. Which
 * branches apply is decided by the SHARED `lifecycleBranches`; where they
 * sit by the SHARED `assignSlots`. This file knows neither.
 */
import type { ActiveSheet, CtaWidth, EscrowTxType, LifecycleBranch } from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { widthClass } from './width'

interface Props {
  branch: LifecycleBranch
  isTxBuilding: boolean
  /** Decided by the arrangement — see CtaWidth. */
  width: CtaWidth
  onAction: (action: ActiveSheet) => void
  onTxAction: (action: EscrowTxType) => void
  onRetryDraft: () => void
}


export function LifecycleCTA({ branch, isTxBuilding, width, onAction, onTxAction, onRetryDraft }: Props) {
  const w = widthClass(width)
  const busyLabel = (label: string) => (isTxBuilding ? 'Working…' : label)

  switch (branch) {
    case 'retryDraft':
      return <Button size="lg" className={w} onClick={onRetryDraft}>Edit &amp; repost</Button>

    case 'deleteDraft':
      return <Button variant="outline" size="lg" className={w} onClick={() => onAction('delete')}>Delete Draft</Button>

    case 'refundExpired':
      return (
        <Button size="lg" className={w} disabled={isTxBuilding} onClick={() => onTxAction('refund_expired')}>
          {busyLabel('Claim Refund')}
        </Button>
      )

    case 'accept':
      return <Button size="lg" className={w} onClick={() => onTxAction('accept')}>Accept Gig</Button>

    case 'decline':
      return <Button variant="outline" size="lg" className={w} onClick={() => onTxAction('decline')}>Decline</Button>

    case 'cancel':
      // Solid danger, as mobile draws it: cancelling unwinds a funded escrow,
      // and the commit control must not dress like the neutral secondaries.
      return (
        <Button variant="danger" size="lg" className={w} onClick={() => onTxAction('cancel')}>
          Cancel Gig
        </Button>
      )

    case 'submit':
      return <Button size="lg" className={w} onClick={() => onAction('proof')}>Submit Proof</Button>

    case 'approve':
      return (
        <Button size="lg" className={w} disabled={isTxBuilding} onClick={() => onTxAction('approve')}>
          {busyLabel('Approve & Pay')}
        </Button>
      )

    case 'claimStalled':
      return (
        <Button size="lg" className={w} disabled={isTxBuilding} onClick={() => onTxAction('claim_stalled')}>
          {busyLabel('Claim Payment')}
        </Button>
      )

    case 'addProof':
      return <Button variant="outline" size="lg" className={w} onClick={() => onAction('addProof')}>Add More Proof</Button>

    case 'addEvidence':
      return <Button variant="outline" size="lg" className={w} onClick={() => onAction('addProof')}>Add Evidence</Button>

    case 'reclaim':
      return (
        <Button size="lg" className={w} disabled={isTxBuilding} onClick={() => onTxAction('reclaim_abandoned')}>
          {busyLabel('Reclaim Escrow')}
        </Button>
      )

    case 'dispute':
      // Opening the explanation dialog is not itself destructive; the final
      // "Raise Dispute" confirmation carries the danger treatment.
      return <Button variant="outline" size="lg" className={w} onClick={() => onAction('dispute')}>Dispute</Button>

    case 'review':
      return <Button variant="outline" size="lg" className={w} onClick={() => onAction('review')}>Leave Review</Button>

    case 'disputedNotice':
      return (
        <p className={`${w} rounded-control bg-feedback-warning-surface px-4 py-3 text-center text-xs font-semibold text-feedback-warning-base`}>
          Under review by admin
        </p>
      )
  }
}
