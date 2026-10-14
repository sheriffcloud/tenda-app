'use client'

/**
 * Shared proof-upload dialog (submit-proof and add-more-proof) — web port of
 * mobile's ProofUploadSheet. Owns its file selection + upload state.
 * `closeMode` preserves the two callers' timing:
 * - 'on-success': close + clear only if onSubmit resolves true.
 * - 'before-submit': close + clear as soon as the upload succeeds, then fire
 *   onSubmit (the parent's tx UI takes over immediately).
 *
 * `requirements` mirrors the server's submit gate as a live checklist —
 * advisory UI only, the server re-checks.
 */
import { useState } from 'react'
import {
  isDataProofType,
  missingProofTypes,
  PROOF_COPY,
  proofRequirementLine,
  type ProofParams,
  type ProofType,
} from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { uploadProofs, type PersistableProof, type PickedProofFile } from '@/lib/uploads/escrow-proofs'
import { FilePicker } from '@/components/form/FilePicker'
import { Modal } from '@/components/ui/overlay/Modal'
import { SigningWalletRow } from '@/components/wallet/SigningWalletRow'
import { DataProofInputs, type DataProofEntry } from './data-proofs/DataProofInputs'
import { PROOF_DIALOG_COPY } from './copy'

export function ProofUploadDialog({
  open,
  onClose,
  title,
  submitLabel,
  closeMode,
  hint,
  chainId,
  boundSigner,
  requirements = [],
  proofParams = null,
  gigPin = null,
  alreadyAttached = [],
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  title: string
  submitLabel: string
  closeMode: 'on-success' | 'before-submit'
  /** Optional note above the button, e.g. that submitting opens the wallet. */
  hint?: string
  /**
   * The escrow's chain — pass it ONLY when submitting commits on-chain
   * (submit-proof). With it the dialog previews the signing wallet, the same
   * row every other wallet-opening gate shows; the off-chain add-more-proof
   * path omits it and no wallet is promised.
   */
  chainId?: string
  /** The chain-bound signer for this viewer (`my_signer_address`), when recorded. */
  boundSigner?: string | null
  /** Proof types the poster requires; empty for the add-more-evidence path. */
  requirements?: readonly ProofType[]
  /** The gig's declared per-type params — drives the structured form and the
   *  geotag distance note. Null/absent for gigs (and exchanges) without any. */
  proofParams?: ProofParams | null
  /** The gig's check-in point, for the pre-submit distance note only. */
  gigPin?: { latitude: number; longitude: number } | null
  /**
   * Proofs already stored against the escrow. The server counts these, so
   * the dialog must too — otherwise a worker whose upload succeeded but
   * whose submit tx failed is locked out on retry.
   */
  alreadyAttached?: readonly { type: ProofType }[]
  onSubmit: (proofs: PersistableProof[]) => Promise<boolean>
}) {
  const [files, setFiles] = useState<PickedProofFile[]>([])
  // Data proofs captured in the dialog (geotag/text/structured), wire-shaped.
  const [dataEntries, setDataEntries] = useState<DataProofEntry[]>([])
  // The capture inputs hold their own text state, so clearing the batch
  // remounts them via this key.
  const [dataGeneration, setDataGeneration] = useState(0)
  const [uploading, setUploading] = useState(false)

  const requiredDataTypes = requirements.filter(isDataProofType)

  // Mirrors the server gate exactly: it reads every proof row on the escrow,
  // so the checklist counts what is already stored plus what is picked or
  // captured now.
  const covered = [...alreadyAttached, ...files, ...dataEntries]
  const missing = missingProofTypes(requirements, covered)

  /**
   * Submitting with NOTHING newly picked, because the escrow already holds the
   * evidence. The case is a worker whose files uploaded and whose submit
   * transaction then failed — a declined wallet, a dropped connection. The
   * upload is the leg that SUCCEEDED, and demanding it again was asking them
   * to re-do the expensive half of a two-part action to retry the cheap half.
   *
   * Only the submit path can reach this: "Add more proof" is handed no
   * `alreadyAttached`, and uploading nothing there would mean nothing at all.
   */
  const reusesAttached =
    files.length === 0 && dataEntries.length === 0 && alreadyAttached.length > 0
  const canSubmit =
    !uploading && missing.length === 0 && (files.length + dataEntries.length > 0 || reusesAttached)

  function clearBatch() {
    setFiles([])
    setDataEntries([])
    setDataGeneration((generation) => generation + 1)
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setUploading(true)
    try {
      // Nothing new picked is the RETRY path (see `reusesAttached`): there is
      // nothing to upload, only a transaction to sign again.
      const uploaded = files.length === 0 ? [] : await uploadProofs(files)
      if (uploaded === null) return // failure already toasted
      const proofs: PersistableProof[] = [...uploaded, ...dataEntries]
      if (closeMode === 'before-submit') {
        onClose()
        clearBatch()
        await onSubmit(proofs)
      } else if (await onSubmit(proofs)) {
        onClose()
        clearBatch()
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {requirements.length > 0 && (
        <p className="text-xs text-content-secondary">
          {proofRequirementLine(requirements, missing)}
        </p>
      )}
      {alreadyAttached.length > 0 && (
        <p className="text-xs text-content-secondary">
          {PROOF_COPY.alreadyAttached(alreadyAttached.map((proof) => proof.type))}
        </p>
      )}
      <FilePicker files={files} onChange={setFiles} max={5} />
      {requiredDataTypes.length > 0 && (
        <DataProofInputs
          key={dataGeneration}
          requirements={requirements}
          proofParams={proofParams}
          gigPin={gigPin}
          onChange={setDataEntries}
        />
      )}
      {chainId !== undefined && (
        <SigningWalletRow
          chainId={chainId}
          {...(boundSigner !== undefined ? { bound: boundSigner } : {})}
        />
      )}
      {hint !== undefined && <p className="text-xs text-content-secondary">{hint}</p>}
      <Button variant="primary" size="lg" fullWidth disabled={!canSubmit} onClick={handleSubmit}>
        {uploading ? PROOF_DIALOG_COPY.working(reusesAttached) : submitLabel}
      </Button>
    </Modal>
  )
}
