import { useState } from 'react'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'
import { Spacer } from '@/components/ui/Spacer'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { FilePicker, type PickedFile } from '@/components/form/FilePicker'
import { missingProofTypes, type ProofType } from '@tenda/shared'
import { ProofRequirementsNote } from '../ProofRequirementsNote'
import { uploadProofs, type Proof } from './upload'

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
 */
export function ProofUploadSheet({
  visible,
  onClose,
  title,
  submitLabel,
  closeMode,
  hint,
  requirements = [],
  alreadyAttached = [],
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
  /**
   * Proofs already stored against the escrow. The server counts these, so the
   * sheet must too — otherwise a worker whose upload succeeded but whose
   * submit tx failed is locked out on retry for re-picking only the file they
   * were missing.
   */
  alreadyAttached?: readonly { type: ProofType }[]
  onSubmit: (proofs: Proof[]) => Promise<boolean>
}) {
  const { theme } = useUnistyles()
  const [files, setFiles] = useState<PickedFile[]>([])
  const [uploading, setUploading] = useState(false)

  async function handleSubmit() {
    if (files.length === 0) return
    setUploading(true)
    try {
      const proofs = await uploadProofs(files)
      if (proofs === null) return // failure already toasted
      if (closeMode === 'before-submit') {
        onClose()
        setFiles([])
        await onSubmit(proofs)
      } else if (await onSubmit(proofs)) {
        onClose()
        setFiles([])
      }
    } finally {
      setUploading(false)
    }
  }

  // Mirrors the server gate exactly: it reads every proof row on the escrow,
  // so the checklist counts what is already stored plus what is picked now.
  const covered = [...alreadyAttached, ...files]
  const unmet = missingProofTypes(requirements, covered).length > 0

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {requirements.length > 0 && (
        <>
          <ProofRequirementsNote required={requirements} attached={covered} />
          <Spacer size={spacing.sm} />
        </>
      )}
      <FilePicker files={files} onChange={setFiles} accept="any" max={5} />
      {hint !== undefined && (
        <>
          <Spacer size={spacing.sm} />
          <Text variant="caption" color={theme.colors.content.secondary}>
            {hint}
          </Text>
        </>
      )}
      <Spacer size={spacing.md} />
      <Button
        variant="primary"
        size="xl"
        fullWidth
        disabled={files.length === 0 || unmet}
        loading={uploading}
        onPress={handleSubmit}
      >
        {submitLabel}
      </Button>
    </BottomSheet>
  )
}
