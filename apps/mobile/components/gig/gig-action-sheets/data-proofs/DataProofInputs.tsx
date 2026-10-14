import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
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
import { spacing } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Text } from '@/components/ui/Text'
import { useDeviceCoords, type DeviceCoords } from '@/hooks/useDeviceCoords'
import { StructuredProofForm } from './StructuredProofForm'

/** A data proof captured in the sheet, already in wire shape. */
export type DataProofEntry = Extract<EscrowProofUpload, { payload: unknown }>

/**
 * Capture UI for the REQUIRED data-proof types (geotag check-in, written
 * answer, structured form driven by the gig's declared fields). Reports the
 * complete entries upward; a type with nothing valid captured contributes no
 * entry, which is what keeps the sheet's checklist honest. Advisory only —
 * the server re-checks every payload (and verifies geotag geometrically).
 */
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
  const { theme } = useUnistyles()
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
      ? Math.round(haversineDistanceMeters(checkIn.latitude, checkIn.longitude, gigPin.latitude, gigPin.longitude))
      : null
  const verdict = distance !== null && radius !== undefined ? checkInVerdict(distance, radius) : null
  const outOfRange = verdict?.outOfRange ?? false

  return (
    <View style={s.wrap}>
      {wanted.includes('geotag') && (
        <View style={s.section}>
          <Text variant="caption" weight="semibold">
            {PROOF_TYPE_LABEL.geotag}
          </Text>
          <Button variant="secondary" size="md" loading={capturing} onPress={() => void handleCheckIn()}>
            {checkIn === null ? 'Check in at my location' : 'Check in again'}
          </Button>
          {error !== null && (
            <Text variant="caption" color={theme.colors.feedback.danger.base}>
              {error}
            </Text>
          )}
          {checkIn !== null && (
            <Text
              variant="caption"
              color={
                outOfRange ? theme.colors.feedback.warning.base : theme.colors.content.secondary
              }
            >
              {PROOF_COPY.checkedInAt(checkIn.latitude, checkIn.longitude)}
              {verdict !== null ? ` — ${verdict.text}` : ''}
            </Text>
          )}
        </View>
      )}

      {wanted.includes('text') && (
        <View style={s.section}>
          <Input
            label={PROOF_TYPE_LABEL.text}
            placeholder="Describe what you did, codes, references…"
            value={answer}
            multiline
            maxLength={MAX_PROOF_TEXT_LENGTH}
            onChangeText={(text) => {
              setAnswer(text)
              report({ answer: text })
            }}
          />
        </View>
      )}

      {wanted.includes('structured') && proofParams?.structured !== undefined && (
        <View style={s.section}>
          <Text variant="caption" weight="semibold">
            {PROOF_TYPE_LABEL.structured}
          </Text>
          <StructuredProofForm
            fields={proofParams.structured.fields}
            onChange={(values) => {
              setStructured(values)
              report({ structured: values })
            }}
          />
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: spacing.md },
  section: { gap: spacing.xs },
})
