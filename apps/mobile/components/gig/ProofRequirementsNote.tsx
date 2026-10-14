import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing, radius } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import {
  missingProofTypes,
  PROOF_COPY,
  proofParamDetail,
  type ProofParams,
  type ProofType,
} from '@tenda/shared'

/**
 * The poster's declared evidence requirement, shown to the worker in two
 * places: on the gig detail BEFORE they accept (so discovering it later is
 * never a surprise), and inside the upload sheet as a live checklist.
 *
 * Pass `attached` to get the checklist behaviour — the note then reports what
 * is still missing and goes green once satisfied. Omit it for the pre-accept
 * case, where nothing has been uploaded yet.
 *
 * Renders nothing when the gig requires no particular type, which is how
 * every gig created before this feature behaves.
 */
export function ProofRequirementsNote({
  required,
  params = null,
  attached,
}: {
  required: readonly ProofType[]
  /** The gig's per-type params — adds the bar each one sets (radius, fields). */
  params?: ProofParams | null
  attached?: readonly { type: ProofType }[]
}) {
  const { theme } = useUnistyles()
  if (required.length === 0) return null

  const missing = attached === undefined ? required : missingProofTypes(required, attached)
  const satisfied = missing.length === 0
  const tone = satisfied ? theme.colors.feedback.success : theme.colors.feedback.warning
  // What the param-bearing requirements demand — "within 500 m", the fields
  // to report — shown with the requirement so the bar is known BEFORE accept.
  const details = required
    .map((type) => proofParamDetail(type, params))
    .filter((detail): detail is string => detail !== null)

  return (
    <View style={[s.note, { backgroundColor: tone.surface }]}>
      <Text variant="caption" weight="semibold" color={tone.base}>
        {satisfied ? PROOF_COPY.allCovered : PROOF_COPY.required(required)}
      </Text>
      {details.map((detail) => (
        <Text key={detail} variant="caption" color={tone.base}>
          {detail}
        </Text>
      ))}
      {!satisfied && attached !== undefined && (
        <Text variant="caption" color={tone.base}>
          {PROOF_COPY.stillNeeded(missing)}
        </Text>
      )}
      {!satisfied && attached === undefined && (
        <Text variant="caption" color={tone.base}>
          {PROOF_COPY.attachBeforeSubmit}
        </Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  note: {
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 2,
  },
})
