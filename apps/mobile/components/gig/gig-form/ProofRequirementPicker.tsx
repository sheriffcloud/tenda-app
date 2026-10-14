import {
  PROOF_TYPES,
  PROOF_TYPE_LABEL,
  normaliseProofRequirements,
  type ProofType,
} from '@tenda/shared'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'

/**
 * Proof types the worker must attach before they can submit. Optional — no
 * selection keeps the pre-existing behaviour where any evidence is accepted.
 * The full vocabulary since #15: the data types (geotag/text/structured) have
 * their params + capture UI, so requiring one no longer strands the worker.
 *
 * Geotag is place-bound, so on a REMOTE gig its chip is disabled — unless it
 * is already selected, because a chip that cannot be pressed cannot be
 * DESELECTED either, and the poster needs a way out of the refused combination
 * (proofSetupProblem names both).
 *
 * The selection is normalised on every change so the stored order matches the
 * server's, and picking video-then-photo is indistinguishable from
 * photo-then-video.
 */
export function ProofRequirementPicker({
  value,
  onChange,
  remote = false,
}: {
  value: ProofType[]
  onChange: (value: ProofType[]) => void
  remote?: boolean
}) {
  const options: readonly ChipOption<ProofType>[] = PROOF_TYPES.map((type) => ({
    label: PROOF_TYPE_LABEL[type],
    value: type,
    disabled: type === 'geotag' && remote && !value.includes('geotag'),
  }))

  function toggle(type: ProofType) {
    const next = value.includes(type) ? value.filter((t) => t !== type) : [...value, type]
    onChange(normaliseProofRequirements(next))
  }

  return (
    <ChipGroup
      label="Required proof"
      hint="Optional. The worker can't submit until they attach every type you pick."
      options={options}
      isSelected={(type) => value.includes(type)}
      onPress={toggle}
    />
  )
}
