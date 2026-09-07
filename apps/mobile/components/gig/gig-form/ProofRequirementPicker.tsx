import {
  PROOF_TYPES,
  PROOF_TYPE_LABEL,
  normaliseProofRequirements,
  type ProofType,
} from '@tenda/shared'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'

const OPTIONS: readonly ChipOption<ProofType>[] = PROOF_TYPES.map((type) => ({
  label: PROOF_TYPE_LABEL[type],
  value: type,
}))

/**
 * Proof types the worker must attach before they can submit. Optional — no
 * selection keeps the pre-existing behaviour where any evidence is accepted.
 *
 * The selection is normalised on every change so the stored order matches the
 * server's, and picking video-then-photo is indistinguishable from
 * photo-then-video.
 */
export function ProofRequirementPicker({
  value,
  onChange,
}: {
  value: ProofType[]
  onChange: (value: ProofType[]) => void
}) {
  function toggle(type: ProofType) {
    const next = value.includes(type) ? value.filter((t) => t !== type) : [...value, type]
    onChange(normaliseProofRequirements(next))
  }

  return (
    <ChipGroup
      label="Required proof"
      hint="Optional. The worker can't submit until they attach every type you pick."
      options={OPTIONS}
      isSelected={(type) => value.includes(type)}
      onPress={toggle}
    />
  )
}
