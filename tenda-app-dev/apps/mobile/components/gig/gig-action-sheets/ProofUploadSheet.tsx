import { useState, type ReactNode } from 'react'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'
import { Spacer } from '@/components/ui/Spacer'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { FilePicker, type PickedFile } from '@/components/form/FilePicker'
import {
  isDataProofType,
  missingProofTypes,
  PROOF_COPY,
  type ProofParams,
  type ProofType,
} from '@tenda/shared'
import { ProofRequirementsNote } from '../ProofRequirementsNote'
import { uploadProofs, type Proof } from './upload'
import { DataProofInputs, type DataProofEntry } from './data-proofs/DataProofInputs'

/**
 * Shared proof-upload sheet (submit-proof and add-more-proof). Owns its file
 * selection + upload state. `closeMode` preserves the two callers' timing:
 * - 'on-success': close + clear only if onSubmit resolves true (sheet stays
 *   open so the user can retry when the hand-off is rejected).
 * - 'before-submit': close + clear as soon as the upload succeeds, then fire
 *   onSubmit (the parent's tx UI takes over immediately).
 *
 * `requirements` mirrors the server's submit gate as a live checklist, so the
 * worker sees what is missing before uploading rather than after a rejected
 * submit. It is advisory UI only — the server re-checks.
 *
 * A submit with NO newly-picked file is allowed when the escrow already holds
 * evidence covering the requirements — the retry after a failed transaction.
 * See `reusesAttached` below.
 */
export function ProofUploadSheet({
  visible,
  onClose,
  title,
  submitLabel,
  closeMode,
  hint,
  requirements = [],
  proofParams = null,
  gigPin = null,
  alreadyAttached = [],
  signerRow,
  onSubmit,
}: {
  visible: boolean
  onClose: () => void
  title: string
  submitLabel: string
  closeMode: 'on-success' | 'before-submit'
  /** Optional note above the button, e.g. that submitting opens the wallet. */
  hint?: string
  /** Proof types the poster requires; empty for the add-more-evidence path. */
  requirements?: readonly ProofType[]
  /** The gig's declared per-type params — drives the structured form and the
   *  geotag distance note. Null/absent for gigs (and exchanges) without any. */
  proofParams?: ProofParams | null
  /** The gig's check-in point, for the pre-submit distance note only. */
  gigPin?: { latitude: number; longitude: number } | null
  /**
   * Proofs already stored against the escrow. The server counts these, so the
   * sheet must too — otherwise a worker whose upload succeeded but whose
   * submit tx failed is locked out on retry for re-picking only the file they
   * were missing.
   */
  alreadyAttached?: readonly { type: ProofType }[]
  /**
   * The signer preview, injected rather than built here. The submit leg opens
   * a wallet and the escrow has already BOUND which one, so a worker with two
   * linked wallets needs to be told before they pick files, not after the
   * chain refuses the signature.
   */
  signerRow?: ReactNode
  onSubmit: (proofs: Proof[]) => Promise<boolean>
}) {
  const { theme } = useUnistyles()
  const [files, setFiles] = useState<PickedFile[]>([])
  // Data proofs captured in the sheet (geotag/text/structured), wire-shaped.
  const [dataEntries, setDataEntries] = useState<DataProofEntry[]>([])
  // RN's Modal keeps children mounted while hidden, so the capture inputs'
  // internal text state survives a close on its own — this key is what
  // actually resets them when the batch is cleared.
  const [dataGeneration, setDataGeneration] = useState(0)
  const [uploading, setUploading] = useState(false)

  const requiredDataTypes = requirements.filter(isDataProofType)

  // Mirrors the server gate exactly: it reads every proof row on the escrow,
  // so the checklist counts what is already stored plus what is picked or
  // captured now.
  const covered = [...alreadyAttached, ...files, ...dataEntries]
  const unmet = missingProofTypes(requirements, covered).length > 0

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
  const reusesAttached = files.length === 0 && dataEntries.length === 0 && alreadyAttached.length > 0
  const canSubmit = !unmet && (files.length + dataEntries.length > 0 || reusesAttached)

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
      const proofs: Proof[] = [...uploaded, ...dataEntries]
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
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {requirements.length > 0 && (
        <>
          <ProofRequirementsNote required={requirements} params={proofParams} attached={covered} />
          <Spacer size={spacing.sm} />
        </>
      )}
      {alreadyAttached.length > 0 && (
        <>
          <Text variant="caption" color={theme.colors.content.secondary}>
            {PROOF_COPY.alreadyAttached(alreadyAttached.map((proof) => proof.type))}
          </Text>
          <Spacer size={spacing.sm} />
        </>
      )}
      <FilePicker files={files} onChange={setFiles} accept="any" max={5} />
      {requiredDataTypes.length > 0 && (
        <>
          <Spacer size={spacing.sm} />
          <DataProofInputs
            key={dataGeneration}
            requirements={requirements}
            proofParams={proofParams}
            gigPin={gigPin}
            onChange={setDataEntries}
          />
        </>
      )}
      {hint !== undefined && (
        <>
          <Spacer size={spacing.sm} />
          <Text variant="caption" color={theme.colors.content.secondary}>
            {hint}
          </Text>
        </>
      )}
      {signerRow !== undefined && (
        <>
          <Spacer size={spacing.sm} />
          {signerRow}
        </>
      )}
      <Spacer size={spacing.md} />
      <Button
        variant="primary"
        size="xl"
        fullWidth
        disabled={!canSubmit}
        loading={uploading}
        onPress={handleSubmit}
      >
        {submitLabel}
      </Button>
    </BottomSheet>
  )
}
