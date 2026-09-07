'use client'

/**
 * Proof types the worker must attach before they can submit — web twin of
 * mobile's gig-form/ProofRequirementPicker. Optional — no selection keeps
 * the pre-existing behaviour where any evidence is accepted. The full
 * vocabulary since #15: the data types (geotag/text/structured) have their
 * params + capture UI, so requiring one no longer strands the worker.
 *
 * Geotag is place-bound, so on a REMOTE gig its chip is disabled — unless it
 * is already selected, because a disabled chip cannot be DESELECTED either,
 * and the poster needs a way out of the refused combination. The selection
 * is normalised on every change so the stored order matches the server's.
 */
import {
  PROOF_TYPES,
  PROOF_TYPE_LABEL,
  normaliseProofRequirements,
  type ProofType,
} from '@tenda/shared'
import { Chip } from '@/components/ui/Chip'

export function ProofRequirementPicker({
  value,
  onChange,
  remote = false,
}: {
  value: ProofType[]
  onChange: (value: ProofType[]) => void
  remote?: boolean
}) {
  function toggle(type: ProofType) {
    const next = value.includes(type) ? value.filter((t) => t !== type) : [...value, type]
    onChange(normaliseProofRequirements(next))
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-content-primary">Required proof</p>
      <p className="-mt-1 text-xs text-content-tertiary">
        Optional. The worker can&apos;t submit until they attach every type you pick.
      </p>
      <div className="flex flex-wrap gap-2">
        {PROOF_TYPES.map((type) => (
          <Chip
            key={type}
            label={PROOF_TYPE_LABEL[type]}
            selected={value.includes(type)}
            disabled={type === 'geotag' && remote && !value.includes('geotag')}
            onClick={() => toggle(type)}
          />
        ))}
      </div>
    </div>
  )
}
