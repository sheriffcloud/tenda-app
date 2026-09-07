'use client'

/**
 * Everything a PARTY can do to an escrow: the CTA bar, the transaction gate,
 * the input dialogs and the progress monitor.
 *
 * Split out of `GigDetailAuthed` in the #17 review. That component pairs these
 * actions with the party-scoped CONTENT — the takedown notice and the party
 * panel — which is right for the public page, whose body is the anonymous
 * listing. The workspace dossier renders that content ITSELF (the money block,
 * the timeline, the party half), so composing the whole of `GigDetailAuthed`
 * there printed the takedown banner twice — measured, `takedown: 2` — and
 * would have printed the counterparty and every proof twice the moment an
 * escrow had either.
 *
 * One definition of the machine, two compositions of it.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TX_PROGRESS_LABEL,
  checkEscrowTransitionApplied,
  formatAssetAmount,
  formatDuration,
  txSuccessCopy,
  type ActiveSheet,
  type EscrowTxType,
  type GigDetail,
} from '@tenda/shared'
import { api } from '@/api/client'
import { useGigsStore } from '@/stores/gigs.store'
import { ROUTES } from '@/lib/routes'
import { useEscrowActions, type EscrowProofInput } from '@/hooks/escrow/useEscrowActions'
import { useEscrowFee } from '@/hooks/escrow/useEscrowFee'
import { useGigApprovalFlow } from '@/hooks/gig/useGigApprovalFlow'
import { showToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/overlay/ConfirmDialog'
import { TxConfirmDialog } from '@/components/escrow/TxConfirmDialog'
import { TransactionMonitor } from '@/components/escrow/TransactionMonitor'
import { GigCTABar } from './GigCTABar'
import { GigActionDialogs } from './action-dialogs'
import { ApplyDialog } from '@/components/gig/gig-applications'

export function GigEscrowActions({ gig, userId }: { gig: GigDetail; userId: string }) {
  const router = useRouter()
  const fetchGigDetail = useGigsStore((s) => s.fetchGigDetail)

  const [activeSheet, setActiveSheet] = useState<ActiveSheet | null>(null)
  const [confirmAction, setConfirmAction] = useState<EscrowTxType | null>(null)

  const actions = useEscrowActions({
    escrowId: gig.escrow_id,
    chainId: gig.chain_id,
    asset: gig.asset,
    amountRaw: gig.amount_raw,
    // Refused as taken down: re-read so the bar stops offering what the
    // server has just declined.
    onStale: () => void fetchGigDetail(gig.escrow_id),
  })

  // Worker-net projection for the confirm dialogs (approve/claim quote what
  // is actually credited — the escrow's fee tier, live platform bps).
  const { netRaw, feePct } = useEscrowFee(gig.is_seeker, gig.amount_raw)

  const approval = useGigApprovalFlow({
    escrowId: gig.escrow_id,
    onChanged: () => void fetchGigDetail(gig.escrow_id),
    onRequestUnassign: () => setConfirmAction('unassign'),
  })

  // Fire the gated transition the confirm dialog was showing, then close it.
  function runConfirmedAction() {
    const action = confirmAction
    setConfirmAction(null)
    switch (action) {
      case 'accept': return void actions.accept()
      case 'approve': return void actions.approve()
      case 'claim_stalled': return void actions.claim()
      case 'cancel': return void actions.cancel()
      case 'refund_expired': return void actions.refund('refund_expired')
      case 'reclaim_abandoned': return void actions.refund('reclaim_abandoned')
      case 'unassign': return void actions.unassign()
      case 'decline': return void actions.decline()
    }
  }

  function handleTransactionConfirmed() {
    const action = actions.pendingAction
    actions.clearPending()
    if (action !== null) {
      showToast('success', txSuccessCopy(action, 'gig'))
    }
    if (action === 'cancel') {
      router.push('/my-gigs')
    } else {
      void fetchGigDetail(gig.escrow_id)
    }
  }

  // Sheet-confirmed handlers (dialogs collect input; the hook signs).
  async function handleProofsReady(proofs: EscrowProofInput[]): Promise<boolean> {
    const submitted = await actions.submit(proofs)
    // A failed submit is HALF done: the files uploaded, the transaction did
    // not. Re-read so the dialog's "already attached" is the truth when the
    // worker reopens it — without this the prop was empty in exactly the
    // situation it was written for, and the retry demanded the same upload
    // again.
    if (!submitted) void fetchGigDetail(gig.escrow_id)
    return submitted
  }

  async function handleAddProofsReady(proofs: EscrowProofInput[]): Promise<void> {
    if (await actions.addProofs(proofs)) {
      void fetchGigDetail(gig.escrow_id)
    }
  }

  async function handleDisputeReady(reason: string): Promise<boolean> {
    return actions.dispute(reason, gig.dispute_bond_raw)
  }

  return (
    <div className="flex flex-col gap-4">
      <GigCTABar
        gig={gig}
        userId={userId}
        isTxBuilding={actions.busyAction !== null}
        txInProgress={actions.pendingTxRef !== null}
        onAction={setActiveSheet}
        onTxAction={setConfirmAction}
        onApprovalAction={approval.handleAction}
        onRetryDraft={() => router.push(`${ROUTES.createGig}?draftId=${gig.escrow_id}`)}
      />

      <TxConfirmDialog
        action={confirmAction}
        chainId={gig.chain_id}
        boundSigner={gig.my_signer_address}
        ctx={{
          amount: formatAssetAmount(gig.amount_raw, gig.asset),
          kind: 'gig',
          deliverWithin:
            gig.completion_duration_seconds != null
              ? formatDuration(gig.completion_duration_seconds)
              : null,
          netAmount: netRaw !== null ? formatAssetAmount(netRaw.toString(), gig.asset) : null,
          feePct,
        }}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />

      <GigActionDialogs
        gig={gig}
        activeSheet={activeSheet}
        onClose={() => setActiveSheet(null)}
        onReviewSubmitted={() => void fetchGigDetail(gig.escrow_id)}
        onProofsReady={handleProofsReady}
        onAddProofsReady={handleAddProofsReady}
        onDisputeReady={handleDisputeReady}
      />

      {(actions.phase !== 'idle' || actions.pendingTxRef !== null) && (
        <TransactionMonitor
          signature={actions.pendingTxRef}
          phase={actions.phase}
          actionLabel={actions.activeAction !== null ? TX_PROGRESS_LABEL[actions.activeAction] : undefined}
          escrowId={gig.escrow_id}
          chainId={gig.chain_id}
          checkApplied={() =>
            checkEscrowTransitionApplied(actions.pendingAction, () => api.gigs.get({ id: gig.escrow_id }))
          }
          onConfirmed={handleTransactionConfirmed}
          onFailed={(msg) => {
            actions.clearPending()
            showToast('info', msg || 'Transaction pending, will sync when confirmed')
            // Any failed transaction leaves this screen describing a state the
            // chain did not reach, so it re-reads whatever the action was. The
            // case that made it necessary is `handleProofsReady`'s: a submit
            // that broadcast and then failed leaves the proofs stored, and the
            // retry has to see them.
            void fetchGigDetail(gig.escrow_id)
          }}
        />
      )}

      <ApplyDialog
        open={approval.applyOpen}
        busy={approval.busy}
        chainId={gig.chain_id}
        // Re-apply starts on the wallet the previous application recorded.
        initialWallet={gig.viewer?.application?.wallet_address ?? null}
        onClose={approval.closeApply}
        onSubmit={approval.apply}
      />

      {/* Off-chain confirms use the styled ConfirmDialog, never window.confirm
          and never TxConfirmDialog — no wallet opens, so promising one would
          be a lie. */}
      <ConfirmDialog {...approval.confirmDialog} />
    </div>
  )
}
