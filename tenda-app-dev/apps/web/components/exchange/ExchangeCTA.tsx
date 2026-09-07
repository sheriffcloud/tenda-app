'use client'

/**
 * Exchange CTA set — web port of mobile's ExchangeCTA over the SHARED
 * visibility helpers (same builder as the gig CTA so neither can drift):
 * 'submit' is the buyer's fiat-payment proof ("Mark as Paid"); the
 * seller's approve releases the crypto. Accept/Decline are asked
 * SEPARATELY (declining survives a takedown); claim is checked before
 * add-proof (getting crypto wins over adding evidence); the buyer can
 * escalate to a dispute while submitted.
 */
import {
  canAccept,
  canAddProof,
  canCancel,
  canClaim,
  canDecline,
  canDispute,
  canPublish,
  canReview,
  escrowPartiesOf,
  type EscrowTxType,
  type ExchangeDetail,
} from '@tenda/shared'
import { canSubmit, type ActiveSheet } from '@tenda/shared'
import { Button } from '@/components/ui/Button'

export function ExchangeCTA({
  offer,
  userId,
  busy,
  onTxAction,
  onSheet,
}: {
  offer: ExchangeDetail
  userId: string
  busy: boolean
  onTxAction: (action: EscrowTxType) => void
  onSheet: (sheet: ActiveSheet) => void
}) {
  const parties = escrowPartiesOf(offer)
  const isCreator = userId === offer.creator.id

  if (offer.status === 'draft' && isCreator) {
    const publishable = canPublish(parties, userId)
    return (
      <div className="flex gap-2">
        <Button variant="outline" fullWidth onClick={() => onSheet('delete')}>
          Delete Draft
        </Button>
        {publishable && (
          <Button fullWidth disabled={busy} onClick={() => onTxAction('create')}>
            Publish Offer
          </Button>
        )}
      </div>
    )
  }

  const acceptable = canAccept(parties, userId)
  const declinable = canDecline(parties, userId)
  if (acceptable || declinable) {
    return (
      <div className="flex gap-2">
        {acceptable && (
          <Button fullWidth disabled={busy} onClick={() => onTxAction('accept')}>
            Accept Offer
          </Button>
        )}
        {declinable && (
          <Button variant="outline" fullWidth={!acceptable} disabled={busy} onClick={() => onTxAction('decline')}>
            Decline
          </Button>
        )}
      </div>
    )
  }
  if (canCancel(parties, userId) && offer.status === 'open') {
    return (
      // Solid danger (mobile parity): withdrawing a live offer unwinds a
      // funded escrow, and the commit control must read as destructive.
      <Button variant="danger" fullWidth disabled={busy} onClick={() => onTxAction('cancel')}>
        Cancel Offer
      </Button>
    )
  }
  if (canSubmit(parties, userId)) {
    return (
      <Button fullWidth onClick={() => onSheet('proof')}>
        Mark as Paid
      </Button>
    )
  }
  if (offer.status === 'submitted' && isCreator) {
    return (
      <div className="flex gap-2">
        <Button fullWidth disabled={busy} onClick={() => onTxAction('approve')}>
          Confirm &amp; Release
        </Button>
        {/* Solid danger on the exchange surface (mobile parity) — unlike the
            gig's restrained outline: here the money is a fiat transfer the
            platform never saw, so contesting it is the gravest move on the
            page and dresses accordingly. */}
        <Button variant="danger" onClick={() => onSheet('dispute')}>
          Dispute
        </Button>
      </div>
    )
  }
  // Claim BEFORE add-proof: a submitted buyer past the approval deadline
  // satisfies both, and getting their crypto must win.
  if (canClaim({ ...parties, approval_deadline: offer.approval_deadline }, userId)) {
    return (
      <Button fullWidth disabled={busy} onClick={() => onTxAction('claim_stalled')}>
        Claim Crypto
      </Button>
    )
  }
  if (canAddProof(parties, userId)) {
    if (offer.status !== 'disputed' && canDispute(parties, userId)) {
      return (
        <div className="flex gap-2">
          <Button variant="outline" fullWidth onClick={() => onSheet('addProof')}>
            Add More Proof
          </Button>
          <Button variant="danger" onClick={() => onSheet('dispute')}>
            Dispute
          </Button>
        </div>
      )
    }
    return (
      // The non-disputed arm is unreachable today and kept ON PURPOSE (see
      // mobile's note): narrow canDispute and a non-disputed escrow lands
      // here, where "Add Evidence" would be the wrong word.
      <Button variant="outline" fullWidth onClick={() => onSheet('addProof')}>
        {offer.status === 'disputed' ? 'Add Evidence' : 'Add More Proof'}
      </Button>
    )
  }
  if (canDispute(parties, userId)) {
    return (
      <Button variant="danger" fullWidth onClick={() => onSheet('dispute')}>
        Dispute
      </Button>
    )
  }
  if (canReview(parties, userId) && !offer.reviews.some((r) => r.reviewer_id === userId)) {
    return (
      <Button variant="outline" fullWidth onClick={() => onSheet('review')}>
        Leave Review
      </Button>
    )
  }
  return null
}
