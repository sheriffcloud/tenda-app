'use client'

/**
 * Capture UI for the REQUIRED data-proof types — web twin of mobile's
 * DataProofInputs (geotag check-in, written answer, structured form driven
 * by the gig's declared fields). Reports the complete entries upward; a type
 * with nothing valid captured contributes no entry, which is what keeps the
 * dialog's checklist honest. Advisory only — the server re-checks every
 * payload (and verifies geotag geometrically).
 */
import { useState } from 'react'
import {
  DATA_PROOF_TYPES,
  MAX_PROOF_TEXT_LENGTH,
  PROOF_COPY,
  PROOF_TYPE_LABEL,
  checkInVerdict,
  haversineDistanceMeters,
  type EscrowProofUpload,
  type ProofParams,
  type ProofType,
  type StructuredProofValue,
} from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { controlClassName } from '@/components/ui/TextField'
import { useDeviceCoords, type DeviceCoords } from '@/hooks/useDeviceCoords'
import { StructuredProofForm } from './StructuredProofForm'

/** A data proof captured in the dialog, already in wire shape. */
export type DataProofEntry = Extract<EscrowProofUpload, { payload: unknown }>

export function DataProofInputs({
  requirements,
  proofParams,
  gigPin,
  onChange,
}: {
  requirements: readonly ProofType[]
  proofParams: ProofParams | null
  /** The gig's declared check-in point, for the pre-submit distance note. */
  gigPin: DeviceCoords | null
  onChange: (entries: DataProofEntry[]) => void
}) {
  const { capture, capturing, error } = useDeviceCoords()
  const [checkIn, setCheckIn] = useState<DeviceCoords | null>(null)
  const [answer, setAnswer] = useState('')
  const [structured, setStructured] = useState<Record<string, StructuredProofValue> | null>(null)

  const wanted = DATA_PROOF_TYPES.filter((type) => requirements.includes(type))
  if (wanted.length === 0) return null

  function report(over: {
    checkIn?: DeviceCoords | null
    answer?: string
    structured?: Record<string, StructuredProofValue> | null
  }) {
    const pin = over.checkIn !== undefined ? over.checkIn : checkIn
    const text = (over.answer !== undefined ? over.answer : answer).trim()
    const values = over.structured !== undefined ? over.structured : structured
    const entries: DataProofEntry[] = []
    if (wanted.includes('geotag') && pin !== null) {
      entries.push({ type: 'geotag', payload: { latitude: pin.latitude, longitude: pin.longitude } })
    }
    if (wanted.includes('text') && text !== '') {
      entries.push({ type: 'text', payload: { text } })
    }
    if (wanted.includes('structured') && values !== null) {
      entries.push({ type: 'structured', payload: { values } })
    }
    onChange(entries)
  }

  async function handleCheckIn() {
    const coords = await capture()
    if (coords === null) return
    setCheckIn(coords)
    report({ checkIn: coords })
  }

  // Pre-submit honesty: the server verifies the check-in against the gig's
  // pin + radius, so say where this one stands before the wallet ever opens.
  const radius = proofParams?.geotag?.radius_m
  const distance =
    checkIn !== null && gigPin !== null
      ? Math.round(
          haversineDistanceMeters(checkIn.latitude, checkIn.longitude, gigPin.latitude, gigPin.longitude),
        )
      : null
  const verdict = distance !== null && radius !== undefined ? checkInVerdict(distance, radius) : null
  const outOfRange = verdict?.outOfRange ?? false

  return (
    <div className="flex flex-col gap-4">
      {wanted.includes('geotag') && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-content-primary">{PROOF_TYPE_LABEL.geotag}</p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={capturing}
            onClick={() => void handleCheckIn()}
          >
            {capturing
              ? 'Reading location…'
              : checkIn === null
                ? 'Check in at my location'
                : 'Check in again'}
          </Button>
          {error !== null && <p className="text-xs text-feedback-danger-text">{error}</p>}
          {checkIn !== null && (
            <p
              className={
                outOfRange ? 'text-xs text-feedback-warning-text' : 'text-xs text-content-secondary'
              }
            >
              {PROOF_COPY.checkedInAt(checkIn.latitude, checkIn.longitude)}
              {verdict !== null ? ` — ${verdict.text}` : ''}
            </p>
          )}
        </div>
      )}

      {wanted.includes('text') && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-control-input-label">
          {PROOF_TYPE_LABEL.text}
          <textarea
            className={`${controlClassName} min-h-20 resize-y`}
            placeholder="Describe what you did, codes, references…"
            value={answer}
            maxLength={MAX_PROOF_TEXT_LENGTH}
            onChange={(e) => {
              setAnswer(e.target.value)
              report({ answer: e.target.value })
            }}
          />
        </label>
      )}

      {wanted.includes('structured') && proofParams?.structured !== undefined && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-content-primary">
            {PROOF_TYPE_LABEL.structured}
          </p>
          <StructuredProofForm
            fields={proofParams.structured.fields}
            onChange={(values) => {
              setStructured(values)
              report({ structured: values })
            }}
          />
        </div>
      )}
    </div>
  )
}
