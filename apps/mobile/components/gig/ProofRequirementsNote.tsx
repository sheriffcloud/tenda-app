import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing, radius } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { formatProofTypeList, missingProofTypes, type ProofType } from '@tenda/shared'

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
  attached,
}: {
  required: readonly ProofType[]
  attached?: readonly { type: ProofType }[]
}) {
  const { theme } = useUnistyles()
  if (required.length === 0) return null

  const missing = attached === undefined ? required : missingProofTypes(required, attached)
  const satisfied = missing.length === 0
  const tone = satisfied ? theme.colors.feedback.success : theme.colors.feedback.warning

  return (
    <View style={[s.note, { backgroundColor: tone.surface }]}>
      <Text variant="caption" weight="semibold" color={tone.base}>
        {satisfied ? 'All required proof attached' : `Required proof: ${formatProofTypeList(required)}`}
      </Text>
      {!satisfied && attached !== undefined && (
        <Text variant="caption" color={tone.base}>
          Still needed: {formatProofTypeList(missing)}
        </Text>
      )}
      {!satisfied && attached === undefined && (
        <Text variant="caption" color={tone.base}>
          You&apos;ll need to attach this before you can submit the work.
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
