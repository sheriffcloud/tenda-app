'use client'

/**
 * Input + off-chain dialogs for the gig detail — web port of mobile's
 * GigActionSheets (dispute reason, review, delete-draft confirm) around the
 * shared ProofUploadDialog. The wallet-opening transitions are gated by the
 * screen's TxConfirmDialog; this owns proof upload, dispute input, review
 * and the off-chain draft delete.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  errorMessage,
  formatAssetAmount,
  type ActiveSheet,
  type ProofParams,
  type ProofType,
  type ReviewInput,
} from '@tenda/shared'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/overlay/ConfirmDialog'
import { controlClassName } from '@/components/ui/TextField'
import { showToast } from '@/components/ui/Toast'
import { useGigsStore } from '@/stores/gigs.store'
import type { PersistableProof } from '@/lib/uploads/escrow-proofs'
import { Modal } from '@/components/ui/overlay/Modal'
import { SigningWalletRow } from '@/components/wallet/SigningWalletRow'
import { ProofUploadDialog } from './ProofUploadDialog'

/** Wallet note for the on-chain proof commit — reassures no funds move. */
const PROOF_ONCHAIN_HINT =
  "You'll approve this in your wallet to record it on-chain — no funds leave your wallet."

/** The minimal escrow shape the dialogs need; gig + exchange both satisfy it. */
interface EscrowActionTarget {
  escrow_id: string
  /** Base-units bond ('0' when none) — feeds the dispute dialog's bond note. */
  dispute_bond_raw: string
  asset: string
  /** Feeds the signing-wallet preview on the on-chain dialogs (submit, dispute). */
  chain_id: string
  /** The viewer's chain-bound wallet, when the escrow recorded one. */
  my_signer_address: string | null
  proof_requirements?: readonly ProofType[]
  /** Gig-only: per-type params behind the requirements (geotag/structured). */
  proof_params?: ProofParams | null
  /** Gig-only: the declared check-in point, for the geotag distance note. */
  latitude?: number | null
  longitude?: number | null
  proofs?: readonly { type: ProofType }[]
}

export function DisputeDialog({
  open,
  onClose,
  bondLabel = null,
  chainId,
  boundSigner,
  onDisputeReady,
}: {
  open: boolean
  onClose: () => void
  bondLabel?: string | null
  /** The escrow's chain — with it the dialog previews the signing wallet. */
  chainId?: string
  /** The chain-bound signer for this viewer (`my_signer_address`), when recorded. */
  boundSigner?: string | null
  onDisputeReady: (reason: string) => Promise<boolean>
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  // Spell out the on-chain cost + wallet step before the user commits.
  const note =
    bondLabel !== null
      ? `A ${bondLabel} bond is locked in escrow when you open a dispute (returned if it resolves in your favour). Your wallet will open to approve.`
      : 'Your wallet will open to approve when you raise the dispute.'

  function close() {
    setReason('')
    onClose()
  }

  async function handleDispute() {
    if (!reason.trim()) return
    setLoading(true)
    try {
      if (await onDisputeReady(reason.trim())) close()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} title="Raise a dispute" onClose={close}>
      <label className="flex flex-col gap-1 text-sm font-semibold text-control-input-label">
        Reason
        <textarea
          className={`${controlClassName} min-h-24 resize-y`}
          placeholder="Describe the issue clearly..."
          value={reason}
          maxLength={2000}
          onChange={(e) => setReason(e.target.value)}
        />
        <span className="text-xs font-normal text-content-tertiary">
          An admin will review and reach out. Max 2000 characters.
        </span>
      </label>
      {chainId !== undefined && (
        <SigningWalletRow
          chainId={chainId}
          {...(boundSigner !== undefined ? { bound: boundSigner } : {})}
        />
      )}
      <p className="text-xs text-content-secondary">{note}</p>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        className="bg-feedback-danger-base hover:bg-feedback-danger-base/90"
        disabled={!reason.trim() || loading}
        onClick={handleDispute}
      >
        {loading ? 'Working…' : 'Raise Dispute'}
      </Button>
    </Modal>
  )
}

export function ReviewDialog({
  open,
  onClose,
  escrowId,
  onReviewSubmitted,
}: {
  open: boolean
  onClose: () => void
  escrowId: string
  onReviewSubmitted: () => void
}) {
  const reviewEscrow = useGigsStore((s) => s.reviewEscrow)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')

  function close() {
    setScore(null)
    setComment('')
    onClose()
  }

  async function handleReview() {
    if (score === null) return
    try {
      await reviewEscrow(escrowId, {
        score: score as ReviewInput['score'],
        comment: comment.trim() || undefined,
      })
      close()
      onReviewSubmitted()
      showToast('success', 'Review submitted!')
    } catch (e) {
      showToast('error', errorMessage(e) || 'Failed to submit review')
    }
  }

  return (
    <Modal open={open} title="Leave a review" onClose={close}>
      <div className="flex justify-center gap-1" role="radiogroup" aria-label="Score">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={score === value}
            aria-label={`${value} star${value > 1 ? 's' : ''}`}
            className={`text-2xl ${score !== null && value <= score ? 'text-feedback-warning-base' : 'text-border-strong'}`}
            onClick={() => setScore(value)}
          >
            ★
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-control-input-label">
        Comment (optional)
        <textarea
          className={`${controlClassName} min-h-20 resize-y`}
          placeholder="Share your experience..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <Button variant="primary" size="lg" fullWidth disabled={score === null} onClick={handleReview}>
        Submit Review
      </Button>
    </Modal>
  )
}

export function GigActionDialogs({
  gig,
  activeSheet,
  onClose,
  onReviewSubmitted,
  onProofsReady,
  onAddProofsReady,
  onDisputeReady,
}: {
  gig: EscrowActionTarget
  activeSheet: ActiveSheet | null
  onClose: () => void
  onReviewSubmitted: () => void
  onProofsReady: (proofs: PersistableProof[]) => Promise<boolean>
  onAddProofsReady: (proofs: PersistableProof[]) => Promise<void>
  onDisputeReady: (reason: string) => Promise<boolean>
}) {
  const router = useRouter()

  const bondLabel =
    gig.dispute_bond_raw !== '0' ? formatAssetAmount(gig.dispute_bond_raw, gig.asset) : null

  async function handleDeleteDraft() {
    onClose()
    try {
      // Drafts are pre-sign staging rows, discarded off-chain.
      await api.escrows.delete({ id: gig.escrow_id })
      showToast('success', 'Draft deleted')
      router.push('/my-gigs')
    } catch (e) {
      showToast('error', errorMessage(e) || 'Failed to delete draft')
    }
  }

  return (
    <>
      <ProofUploadDialog
        open={activeSheet === 'proof'}
        onClose={onClose}
        title="Submit proof"
        submitLabel="Submit"
        // On-chain commit: hand off to the progress modal as soon as the
        // files upload, so it (not the dialog) owns the wallet phases.
        closeMode="before-submit"
        hint={PROOF_ONCHAIN_HINT}
        chainId={gig.chain_id}
        boundSigner={gig.my_signer_address}
        requirements={gig.proof_requirements ?? []}
        proofParams={gig.proof_params ?? null}
        gigPin={
          gig.latitude != null && gig.longitude != null
            ? { latitude: gig.latitude, longitude: gig.longitude }
            : null
        }
        alreadyAttached={gig.proofs ?? []}
        onSubmit={onProofsReady}
      />

      <ProofUploadDialog
        open={activeSheet === 'addProof'}
        onClose={onClose}
        title="Add more proof"
        submitLabel="Upload"
        closeMode="before-submit"
        onSubmit={async (proofs) => {
          await onAddProofsReady(proofs)
          return true
        }}
      />

      <DisputeDialog
        open={activeSheet === 'dispute'}
        onClose={onClose}
        bondLabel={bondLabel}
        chainId={gig.chain_id}
        boundSigner={gig.my_signer_address}
        onDisputeReady={onDisputeReady}
      />

      <ReviewDialog
        open={activeSheet === 'review'}
        onClose={onClose}
        escrowId={gig.escrow_id}
        onReviewSubmitted={onReviewSubmitted}
      />

      <ConfirmDialog
        open={activeSheet === 'delete'}
        title="Delete this draft?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteDraft}
        onCancel={onClose}
      />
    </>
  )
}
