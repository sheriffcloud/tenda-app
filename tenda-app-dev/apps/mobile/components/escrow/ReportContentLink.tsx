import { Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'

/** Quiet "report this content" affordance for detail screens. */
export function ReportContentLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useUnistyles()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.link, pressed && { opacity: 0.6 }]}>
      <Text variant="caption" color={theme.colors.content.tertiary}>
        {label}
      </Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  link: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
})
