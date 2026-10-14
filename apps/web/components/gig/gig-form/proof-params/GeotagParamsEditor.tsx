'use client'

/**
 * The geotag requirement's params — web twin of mobile's editor: where the
 * worker must check in (the pin, captured from this device) and how close
 * counts (the radius). Validation lives in the shared proofSetupProblem;
 * this only edits the draft.
 */
import {
  MAX_GEOTAG_RADIUS_M,
  MIN_GEOTAG_RADIUS_M,
  formatCoords,
  formatMetres,
  type ProofParamsDraft,
} from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { useDeviceCoords } from '@/hooks/useDeviceCoords'

export function GeotagParamsEditor({
  draft,
  onChange,
}: {
  draft: ProofParamsDraft
  onChange: (draft: ProofParamsDraft) => void
}) {
  const { capture, capturing, error } = useDeviceCoords()

  async function capturePin() {
    const pin = await capture()
    if (pin !== null) onChange({ ...draft, pin })
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-card p-4">
      <p className="text-sm font-semibold text-content-primary">Check-in point</p>
      <p className="text-xs text-content-secondary">
        {draft.pin === null
          ? 'Capture where the work happens — the worker checks in against it.'
          : `Pinned at ${formatCoords(draft.pin.latitude, draft.pin.longitude)}`}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="md"
        disabled={capturing}
        onClick={() => void capturePin()}
      >
        {capturing
          ? 'Reading location…'
          : draft.pin === null
            ? 'Use my current location'
            : 'Recapture location'}
      </Button>
      {error !== null && <p className="text-xs text-feedback-danger-text">{error}</p>}
      <TextField
        label="Check-in radius (metres)"
        inputMode="numeric"
        value={draft.radiusText}
        onChange={(e) => onChange({ ...draft, radiusText: e.target.value })}
      />
      <p className="text-xs text-content-tertiary">
        {MIN_GEOTAG_RADIUS_M} to {formatMetres(MAX_GEOTAG_RADIUS_M)}.
      </p>
    </div>
  )
}
