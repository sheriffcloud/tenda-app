import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import {
  MAX_GEOTAG_RADIUS_M,
  MIN_GEOTAG_RADIUS_M,
  formatCoords,
  formatMetres,
  type ProofParamsDraft,
} from '@tenda/shared'
import { spacing } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Text } from '@/components/ui/Text'
import { useDeviceCoords } from '@/hooks/useDeviceCoords'

/**
 * The geotag requirement's params: where the worker must check in (the pin,
 * captured from THIS device — the poster sets it standing at, or knowing,
 * the work site) and how close counts (the radius). Validation lives in the
 * shared proofSetupProblem; this only edits the draft.
 */
export function GeotagParamsEditor({
  draft,
  onChange,
}: {
  draft: ProofParamsDraft
  onChange: (draft: ProofParamsDraft) => void
}) {
  const { theme } = useUnistyles()
  const { capture, capturing, error } = useDeviceCoords()

  async function capturePin() {
    const pin = await capture()
    if (pin !== null) onChange({ ...draft, pin })
  }

  return (
    <View style={s.wrap}>
      <Text variant="caption" weight="semibold">
        Check-in point
      </Text>
      <Text variant="caption" color={theme.colors.content.secondary}>
        {draft.pin === null
          ? 'Capture where the work happens — the worker checks in against it.'
          : `Pinned at ${formatCoords(draft.pin.latitude, draft.pin.longitude)}`}
      </Text>
      <Button
        variant="secondary"
        size="md"
        loading={capturing}
        onPress={() => void capturePin()}
      >
        {draft.pin === null ? 'Use my current location' : 'Recapture location'}
      </Button>
      {error !== null && (
        <Text variant="caption" color={theme.colors.feedback.danger.base}>
          {error}
        </Text>
      )}
      <Input
        label="Check-in radius (metres)"
        value={draft.radiusText}
        onChangeText={(radiusText) => onChange({ ...draft, radiusText })}
        keyboardType="number-pad"
        helper={`${MIN_GEOTAG_RADIUS_M} to ${formatMetres(MAX_GEOTAG_RADIUS_M)}.`}
      />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, gap: spacing.sm },
})
