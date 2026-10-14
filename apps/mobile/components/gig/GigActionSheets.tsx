import { useRouter } from 'expo-router'
import { showToast } from '@/components/ui/Toast'
import { api } from '@/api/client'
import { errorMessage, formatAssetAmount, type ProofParams, type ProofType } from '@tenda/shared'
import { SigningWalletRow } from '@/components/wallet/SigningWalletRow'
import type { ActiveSheet } from './GigCTABar'
import { ProofUploadSheet } from './gig-action-sheets/ProofUploadSheet'
import { DisputeSheet } from './gig-action-sheets/DisputeSheet'
import { ReviewSheet } from './gig-action-sheets/ReviewSheet'
import { DeleteDraftDialog } from './gig-action-sheets/DeleteDraftDialog'
import type { Proof } from './gig-action-sheets/upload'

/** Wallet note for the on-chain proof commit — reassures no funds move. */
const PROOF_ONCHAIN_HINT =
  "You'll approve this in your wallet to record it on-chain — no funds leave your wallet."

/** The minimal escrow shape the sheets need; gig + exchange both satisfy it. */
interface EscrowActionTarget {
  escrow_id: string
  /** Settlement chain — names the wallet each on-chain sheet will open. */
  chain_id: string
  /**
   * The wallet THIS VIEWER is bound to on this escrow (viewer-relative on the
   * wire). Submit and dispute both sign, and both are already bound, so the
   * sheets say which wallet before the reader starts rather than after the
   * chain refuses.
   */
  my_signer_address: string | null
  /** Base-units bond ('0' when none) — feeds the dispute sheet's bond note. */
  dispute_bond_raw: string
  asset: string
  /** Gig-only: exchange offers declare no proof requirements. */
  proof_requirements?: readonly ProofType[]
  /** Gig-only: per-type params behind the requirements (geotag/structured). */
  proof_params?: ProofParams | null
  /** Gig-only: the declared check-in point, for the geotag distance note. */
  latitude?: number | null
  longitude?: number | null
  /** Proofs already stored on the escrow — counted by the server's submit gate. */
  proofs?: readonly { type: ProofType }[]
}

interface GigActionSheetsProps {
  gig: EscrowActionTarget
  activeSheet: ActiveSheet | null
  onClose: () => void
  onReviewSubmitted: () => void
  onProofsReady: (proofs: Proof[]) => Promise<boolean>
  onAddProofsReady: (proofs: Proof[]) => Promise<void>
  onDisputeReady: (reason: string) => Promise<boolean>
}

/**
 * Input + off-chain sheets for the gig/exchange detail screens. The
 * wallet-opening transitions (accept/approve/claim/cancel/refund) are gated by
 * the screen's shared TxConfirmDialog; this owns proof upload, dispute input,
 * review, and the off-chain draft delete.
 */
export function GigActionSheets({
  gig,
  activeSheet,
  onClose,
  onReviewSubmitted,
  onProofsReady,
  onAddProofsReady,
  onDisputeReady,
}: GigActionSheetsProps) {
  const router = useRouter()

  const bondLabel =
    gig.dispute_bond_raw !== '0' ? formatAssetAmount(gig.dispute_bond_raw, gig.asset) : null

  // Built once: both on-chain sheets sign against the same escrow binding.
  const signerRow = <SigningWalletRow chainId={gig.chain_id} bound={gig.my_signer_address} />

  async function handleDeleteDraft() {
    onClose()
    try {
      // Drafts are pre-sign staging rows, discarded off-chain.
      await api.escrows.delete({ id: gig.escrow_id })
      showToast('success', 'Draft deleted')
      router.back()
    } catch (e) {
      showToast('error', errorMessage(e) || 'Failed to delete draft')
    }
  }

  return (
    <>
      <ProofUploadSheet
        visible={activeSheet === 'proof'}
        onClose={onClose}
        title="Submit proof"
        submitLabel="Submit"
        // On-chain commit: hand off to the progress modal as soon as the files
        // upload, so it (not the sheet) owns the wallet + confirm phases.
        closeMode="before-submit"
        hint={PROOF_ONCHAIN_HINT}
        requirements={gig.proof_requirements ?? []}
        proofParams={gig.proof_params ?? null}
        gigPin={
          gig.latitude != null && gig.longitude != null
            ? { latitude: gig.latitude, longitude: gig.longitude }
            : null
        }
        alreadyAttached={gig.proofs ?? []}
        signerRow={signerRow}
        onSubmit={onProofsReady}
      />

      <ProofUploadSheet
        visible={activeSheet === 'addProof'}
        onClose={onClose}
        title="Add more proof"
        submitLabel="Upload"
        // No signer row: adding evidence is OFF-CHAIN, no wallet opens, so
        // naming a signing wallet here would promise a step that never comes.
        closeMode="before-submit"
        onSubmit={async (proofs) => {
          await onAddProofsReady(proofs)
          return true
        }}
      />

      <DisputeSheet
        visible={activeSheet === 'dispute'}
        onClose={onClose}
        bondLabel={bondLabel}
        signerRow={signerRow}
        onDisputeReady={onDisputeReady}
      />

      <ReviewSheet
        visible={activeSheet === 'review'}
        onClose={onClose}
        escrowId={gig.escrow_id}
        onReviewSubmitted={onReviewSubmitted}
      />

      <DeleteDraftDialog visible={activeSheet === 'delete'} onCancel={onClose} onConfirm={handleDeleteDraft} />
    </>
  )
}
