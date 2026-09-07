import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import type { ModerationPreviewResponse } from '@tenda/shared'

/**
 * Stage-6 live moderation hint above the submit bar, advisory, never
 * blocking. Renders null on approve or when there's no reason to show.
 */
export function ModerationHint({ moderation }: { moderation: ModerationPreviewResponse | null }) {
  const { theme } = useUnistyles()
  if (moderation === null || moderation.decision === 'approve' || moderation.reasons.length === 0) {
    return null
  }

  const isBlock = moderation.decision === 'block'
  return (
    <View
      style={[
        s.hint,
        { backgroundColor: isBlock ? theme.colors.feedback.danger.surface : theme.colors.feedback.warning.surface },
      ]}
    >
      <Text
        style={[s.hintText, { color: isBlock ? theme.colors.feedback.danger.base : theme.colors.feedback.warning.base }]}
      >
        {moderation.reasons[0].message}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  hint: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hintText: { fontSize: 12.5, lineHeight: 17 },
})
