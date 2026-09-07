import { View, StyleSheet } from 'react-native'
import { spacing } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import {
  canAccept,
  canDecline,
  canSubmit,
  canCancel,
  canClaim,
  canDispute,
  canPublish,
  canReview,
  canAddProof,
  escrowPartiesOf,
} from '@tenda/shared'
import type { EscrowTxType, ExchangeDetail } from '@tenda/shared'
import type { ActiveSheet } from '@/components/gig'

interface Props {
  offer: ExchangeDetail
  userId: string
  /** True while a transition is building/confirming (button spinner). */
  busy: boolean
  /** Wallet-opening move → screen shows the shared confirm gate first. */
  onTxAction: (action: EscrowTxType) => void
  onSheet: (sheet: ActiveSheet) => void
}

/**
 * Exchange CTA set over the shared visibility helpers, 'submit' is the
 * buyer's fiat-payment proof ("Mark as Paid"); the seller's approve
 * releases the crypto. Wallet-opening moves route through the confirm gate.
 */
export function ExchangeCTA({ offer, userId, busy, onTxAction, onSheet }: Props) {
  // Read from the offer, never assumed. This used to spread
  // UNRESTRICTED_ACCEPTANCE on the grounds that a P2P offer has no acceptance
  // mode — true of `requires_approval` (server-rejected for kind='exchange'),
  // false of the assignee, which create accepts on either kind. A direct-invite
  // offer therefore showed every stranger an Accept button the server answers
  // with 403. Same builder as the gig CTA, so neither can drift again.
  const parties = escrowPartiesOf(offer)
  const isCreator = userId === offer.creator.id

  // Drafts: publish (build-create rebuilds the unsigned tx, covers
  // fiat-offramp drafts that never had one and signing-declined retries)
  // or discard.
  //
  // The two halves are asked separately because a TAKEN-DOWN draft keeps only
  // one of them: publishing would fund an escrow nobody may accept (and the
  // server refuses it), while discarding is a way out and always stays. The
  // publish half goes through the shared `canPublish` rather than repeating
  // `status === 'draft' && isCreator` — same rule, one owner.
  if (offer.status === 'draft' && isCreator) {
    const publishable = canPublish(parties, userId)
    return (
      <View style={s.row}>
        <View style={s.flex}>
          <Button variant="outline" size="xl" fullWidth onPress={() => onSheet('delete')}>
            Delete Draft
          </Button>
        </View>
        {publishable && (
          <View style={s.flex}>
            <Button variant="primary" size="xl" fullWidth loading={busy} onPress={() => onTxAction('create')}>
              Publish Offer
            </Button>
          </View>
        )}
      </View>
    )
  }
  // Accept and Decline are asked SEPARATELY, never nested, for the reason the
  // gig bar was restructured: `canAccept` refuses a taken-down listing and
  // declining is a way OUT, so an invitee whose offer was pulled from under
  // them must still be able to say no. Nested, their only button would vanish
  // with the takedown and the invitation would hang there unanswerable.
  const acceptable = canAccept(parties, userId)
  const declinable = canDecline(parties, userId)
  if (acceptable || declinable) {
    // Same weighting this bar already gives its other pair (Confirm & Release
    // beside Dispute): the constructive action takes the space, the other is
    // only as wide as its label. Alone, Decline fills the row — `fullWidth` and
    // `flex: 1` fight each other, so it is one or the other, never both.
    const declineWidth = acceptable ? {} : { fullWidth: true as const }
    return (
      <View style={s.row}>
        {acceptable && (
          <Button variant="primary" size="xl" style={s.flex} loading={busy} onPress={() => onTxAction('accept')}>
            Accept Offer
          </Button>
        )}
        {declinable && (
          <Button variant="outline" size="xl" {...declineWidth} loading={busy} onPress={() => onTxAction('decline')}>
            Decline
          </Button>
        )}
      </View>
    )
  }
  if (canCancel(parties, userId) && offer.status === 'open') {
    return (
      <Button variant="danger" size="xl" fullWidth loading={busy} onPress={() => onTxAction('cancel')}>
        Cancel Offer
      </Button>
    )
  }
  if (canSubmit(parties, userId)) {
    return (
      <Button variant="primary" size="xl" fullWidth onPress={() => onSheet('proof')}>
        Mark as Paid
      </Button>
    )
  }
  if (offer.status === 'submitted' && isCreator) {
    return (
      <View style={s.row}>
        <Button variant="primary" size="xl" style={s.flex} loading={busy} onPress={() => onTxAction('approve')}>
          Confirm & Release
        </Button>
        <Button variant="danger" size="xl" onPress={() => onSheet('dispute')}>
          Dispute
        </Button>
      </View>
    )
  }
  // Claim is checked BEFORE add-proof: a submitted buyer past the approval
  // deadline satisfies BOTH canClaim and canAddProof, and getting their crypto
  // must win over uploading more evidence (else the claim action is hidden).
  if (canClaim({ ...parties, approval_deadline: offer.approval_deadline }, userId)) {
    return (
      <Button variant="primary" size="xl" fullWidth loading={busy} onPress={() => onTxAction('claim_stalled')}>
        Claim Crypto
      </Button>
    )
  }
  // The buyer (counterparty) keeps adding payment evidence while the seller
  // reviews (submitted) or the mediator does (disputed) — parity with the gig
  // path, where a dropped-off "Add Evidence" affordance during a dispute is
  // exactly the bug this mirrors. canAddProof is counterparty + submitted|disputed.
  if (canAddProof(parties, userId)) {
    // Submitted (not yet disputed): the buyer can escalate to a dispute too —
    // symmetry with the gig worker (GigCTABar pairs "Add More Proof" with
    // "Dispute"). This branch returns before the canDispute check below, so
    // without pairing it here the buyer could never dispute a stalling seller.
    // Once disputed, evidence only (the mediator owns it — no redundant button).
    if (offer.status !== 'disputed' && canDispute(parties, userId)) {
      return (
        <View style={s.row}>
          <Button variant="outline" size="xl" style={s.flex} onPress={() => onSheet('addProof')}>
            Add More Proof
          </Button>
          <Button variant="danger" size="xl" onPress={() => onSheet('dispute')}>
            Dispute
          </Button>
        </View>
      )
    }
    return (
      // The 'Add More Proof' arm is UNREACHABLE today and is kept on purpose,
      // so please do not "clean it up" to a bare 'Add Evidence'. Reaching this
      // line needs canAddProof true and canDispute false; canAddProof is
      // (submitted|disputed)+counterparty and canDispute is party+(accepted|
      // submitted), so a counterparty on `submitted` always takes the paired
      // branch above and only `disputed` arrives here. Narrow canDispute — a
      // cooldown, a bond requirement, dropping `submitted` — and a non-disputed
      // escrow lands here, where "Add Evidence" would be the wrong word. The
      // ternary costs one uncovered branch and buys correctness under a change
      // nobody would think to re-check this file for.
      <Button variant="outline" size="xl" fullWidth onPress={() => onSheet('addProof')}>
        {offer.status === 'disputed' ? 'Add Evidence' : 'Add More Proof'}
      </Button>
    )
  }
  if (canDispute(parties, userId)) {
    return (
      <Button variant="danger" size="xl" fullWidth onPress={() => onSheet('dispute')}>
        Dispute
      </Button>
    )
  }
  if (canReview(parties, userId) && !offer.reviews.some((r) => r.reviewer_id === userId)) {
    return (
      <Button variant="outline" size="xl" fullWidth onPress={() => onSheet('review')}>
        Leave Review
      </Button>
    )
  }
  return null
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: { flex: 1 },
})
