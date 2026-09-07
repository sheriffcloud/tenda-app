import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { ReactNode } from 'react'
import { spacing, radius } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'

interface Props {
  /** While true the CTA set is replaced by the in-progress notice. */
  txInProgress: boolean
  children: ReactNode | null
}

/** Detail-screen CTA bar: shared frame + tx-in-progress state. */
export function DetailBottomBar({ txInProgress, children }: Props) {
  const { theme } = useUnistyles()

  const content = txInProgress ? (
    <View style={[s.infoNotice, { backgroundColor: theme.colors.feedback.warning.surface }]}>
      <Text variant="caption" color={theme.colors.feedback.warning.base} weight="semibold" align="center">
        Transaction in progress, please wait…
      </Text>
    </View>
  ) : (
    children
  )
  if (!content) return null

  return (
    <View
      style={[
        s.bar,
        {
          backgroundColor: theme.colors.surface.background,
          borderTopColor: theme.colors.border.subtle,
        },
      ]}
    >
      {content}
    </View>
  )
}

const s = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
  },
  infoNotice: {
    padding: spacing.md,
    borderRadius: radius.md,
  },
})
