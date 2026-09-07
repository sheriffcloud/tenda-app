'use client'

/**
 * The offer page (Tier-3 comp, lines 520-645): a two-column read — the offer
 * and its trader on the left, the commitment on the right — over the SAME
 * machinery the gig detail proved: useEscrowActions (sign → broadcast →
 * client-ping), the TxConfirmDialog gate, TransactionMonitor convergence,
 * GigActionDialogs (proof/dispute/review/delete — structural target,
 * kind-agnostic), and escrow-live refresh.
 *
 * The columns collapse to one at 1000px, which is the comp's `[data-two]`
 * breakpoint — and here it matters more than it does on a marketing page: the
 * aside holds the only control that commits money, so it must never be the
 * column that gets squeezed.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import {
  TX_PROGRESS_LABEL,
  checkEscrowTransitionApplied,
  computeRelevantDeadline,
  formatAssetAmount,
  formatFiat,
  txSuccessCopy,
  type ActiveSheet,
  type EscrowTxType,
  type ExchangeDetail,
} from '@tenda/shared'
import { api } from '@/api/client'
import { DossierProofList, dossierProofsFor } from '@/components/escrow/dossier'
import { useEscrowActions, type EscrowProofInput } from '@/hooks/escrow/useEscrowActions'
import { useEscrowFee } from '@/hooks/escrow/useEscrowFee'
import { useEscrowLiveRefresh } from '@/hooks/escrow/live'
import { showToast } from '@/components/ui/Toast'
import { TxConfirmDialog } from '@/components/escrow/TxConfirmDialog'
import { TransactionMonitor } from '@/components/escrow/TransactionMonitor'
import { GigActionDialogs } from '@/components/gig/detail/action-dialogs'
import { TakedownNotice } from '@/components/gig/detail/TakedownNotice'
import { PersonCard } from '@/components/shared/PersonCard'
import { ExchangeCTA } from './ExchangeCTA'
import {
  OFFER_DETAIL_COPY,
  OfferActionAside,
  OfferCountdown,
  OfferHeadline,
  OfferTerms,
  TraderCard,
  exchangeChatContext,
  offerClockFor,
  type OfferPerspective,
} from './detail'
import {
  PaymentInstructionsCard,
  SellerPayoutCard,
  shouldShowPaymentInstructions,
  shouldShowSellerPayout,
} from './PayoutCards'
import { DisputeNotice } from '@/components/escrow/DisputeNotice'

export function ExchangeDetailApp({
  offer,
  userId,
  refresh,
}: {
  offer: ExchangeDetail
  userId: string
  refresh: () => Promise<void>
}) {
  const router = useRouter()
  const [activeSheet, setActiveSheet] = useState<ActiveSheet | null>(null)
  const [confirmAction, setConfirmAction] = useState<EscrowTxType | null>(null)

  const actions = useEscrowActions({
    escrowId: offer.escrow_id,
    chainId: offer.chain_id,
    asset: offer.asset,
    amountRaw: offer.amount_raw,
    // A takedown refusal re-reads rather than leaving a declined button on
    // screen; `refresh` drops the offer on a 404.
    onStale: () => void refresh(),
  })
  const isCreator = userId === offer.creator.id

  // Buyer-net projection for the confirm dialogs (mirror-of-contract math).
  const { netRaw, feePct } = useEscrowFee(offer.is_seeker, offer.amount_raw)

  useEscrowLiveRefresh(offer.escrow_id, refresh, offer.status)

  function runConfirmedAction() {
    const action = confirmAction
    setConfirmAction(null)
    switch (action) {
      case 'create': return void actions.publish()
      case 'accept': return void actions.accept()
      case 'cancel': return void actions.cancel()
      case 'approve': return void actions.approve()
      case 'claim_stalled': return void actions.claim()
      // Declining is the only way out of a direct offer the invitee does
      // not want — the branch must exist even under a takedown.
      case 'decline': return void actions.decline()
    }
  }

  const fiat = formatFiat(Number(offer.fiat_amount), offer.fiat_currency)
  const perspective: OfferPerspective = isCreator ? 'seller' : 'buyer'
  const clock = offerClockFor(offer, perspective)

  function handleTransactionConfirmed() {
    const action = actions.pendingAction
    actions.clearPending()
    if (action !== null) showToast('success', txSuccessCopy(action, 'exchange'))
    if (action === 'cancel') router.push('/exchange')
    else void refresh()
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-8 pb-20 pt-8">
      <Link
        href="/exchange"
        className="inline-flex items-center gap-2 type-body-small font-semibold text-content-tertiary hover:text-content-primary hover:no-underline"
      >
        <ChevronLeft size={16} aria-hidden />
        {OFFER_DETAIL_COPY.back}
      </Link>

      <TakedownNotice escrow={offer} subject="offer" viewerId={userId} />

      {/* The comp collapses `[data-two]` when the CONTENT area drops below
          1000px. Here the content area is the viewport minus the 64px rail —
          this surface has no list column — so the breakpoint is 1064px, not a
          stock `lg:` that would split at a pane 40px narrower than the comp
          allows. */}
      <div
        data-two
        className="mt-6 grid items-start gap-10 min-[1064px]:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="min-w-0">
          <OfferHeadline offer={offer} />
          {clock !== null && <OfferCountdown clock={clock} />}

          {/* Reading order is the ACTING order (user, 2026-08-24, #48): the
              terms of the trade, then — for the matched buyer — exactly where
              the money goes, and only then who is on the other side. The old
              order put two people cards between the reader and the account
              they were mid-transfer to. */}
          <OfferTerms offer={offer} />

          {shouldShowPaymentInstructions(offer, userId) && offer.payout_account !== null && (
            <div className="mt-6">
              <PaymentInstructionsCard
                account={offer.payout_account}
                fiatDisplay={fiat}
                reference={offer.escrow_id.slice(0, 8).toUpperCase()}
                status={offer.status}
                deadline={computeRelevantDeadline(offer)}
              />
            </div>
          )}
          {shouldShowSellerPayout(offer, userId) && offer.payout_account !== null && (
            <div className="mt-6">
              <SellerPayoutCard account={offer.payout_account} />
            </div>
          )}

          {/* No wrapper margin: the card's own mt-8/border-t seam is the
              separation, same as OfferTerms above it. */}
          <TraderCard trader={offer.creator} offer={offer} currentUserId={userId} />

          {/* The buyer is party-scoped: present only once someone has taken
              the offer, and only for the two of them. */}
          {offer.counterparty !== null && (
            <div className="mt-4">
              <PersonCard
                user={offer.counterparty}
                label="Buyer"
                currentUserId={userId}
                context={exchangeChatContext(offer)}
              />
            </div>
          )}

          {offer.proofs.length > 0 && (
            <section className="mt-6 flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-card p-4">
              <h2 className="text-sm font-semibold text-content-primary">
                {OFFER_DETAIL_COPY.proofs}
              </h2>
              {/* The dossier's rows and the SHARED labels (#48) — one
                  escrow's evidence dresses one way, exchange included. */}
              <DossierProofList proofs={dossierProofsFor(offer.proofs) ?? []} />
            </section>
          )}

          {offer.dispute !== null && offer.status === 'disputed' && (
            <div className="mt-6">
              <DisputeNotice
                reason={offer.dispute.reason}
                escrowId={offer.escrow_id}
                isParty={isCreator || userId === offer.counterparty?.id}
              />
            </div>
          )}
        </div>

        <OfferActionAside offer={offer} perspective={perspective}>
          <ExchangeCTA
            offer={offer}
            userId={userId}
            busy={actions.busyAction !== null}
            onTxAction={setConfirmAction}
            onSheet={setActiveSheet}
          />
        </OfferActionAside>
      </div>

      <TxConfirmDialog
        action={confirmAction}
        chainId={offer.chain_id}
        boundSigner={offer.my_signer_address}
        // Publishing a draft rebuilds the create tx, which debits the full
        // amount; every other gated action here moves nothing from the user.
        {...(confirmAction === 'create'
          ? { spend: { assetId: offer.asset, amountRaw: offer.amount_raw } }
          : {})}
        ctx={{
          amount: formatAssetAmount(offer.amount_raw, offer.asset),
          kind: 'exchange',
          netAmount: netRaw !== null ? formatAssetAmount(netRaw.toString(), offer.asset) : null,
          feePct,
        }}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />

      <GigActionDialogs
        gig={offer}
        activeSheet={activeSheet}
        onClose={() => setActiveSheet(null)}
        onReviewSubmitted={() => void refresh()}
        onProofsReady={async (proofs: EscrowProofInput[]) => {
          const submitted = await actions.submit(proofs)
          // A failed submit is HALF done: the receipt uploaded, the
          // transaction did not. Re-read so the dialog knows what the escrow
          // already holds when the seller reopens it to retry.
          if (!submitted) void refresh()
          return submitted
        }}
        onAddProofsReady={async (proofs: EscrowProofInput[]) => {
          if (await actions.addProofs(proofs)) void refresh()
        }}
        onDisputeReady={(reason: string) => actions.dispute(reason, offer.dispute_bond_raw)}
      />

      <TransactionMonitor
        signature={actions.pendingTxRef}
        phase={actions.phase}
        actionLabel={actions.activeAction !== null ? TX_PROGRESS_LABEL[actions.activeAction] : undefined}
        escrowId={offer.escrow_id}
        chainId={offer.chain_id}
        checkApplied={() =>
          checkEscrowTransitionApplied(actions.pendingAction, () => api.exchange.get({ id: offer.escrow_id }))
        }
        onConfirmed={handleTransactionConfirmed}
        onFailed={(msg) => {
          actions.clearPending()
          showToast('info', msg || 'Transaction pending, will sync when confirmed')
          // As above: a submit that broadcast and then failed on chain leaves
          // the proof stored and the escrow where it was.
          void refresh()
        }}
      />
    </div>
  )
}
