import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { shadows, spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'

interface Props {
  /** Why the primary action is unavailable; null hides the hint. */
  hint: string | null
  children: ReactNode
}

/**
 * Sticky bottom action bar. The hint spells out the first unmet requirement
 * so a disabled action never reads as a silently dead button.
 */
export function FormSubmitBar({ hint, children }: Props) {
  const { theme } = useUnistyles()
  return (
    <View style={[s.bar, shadows.sheet, {
      backgroundColor: theme.colors.surface.background,
      borderTopColor: theme.colors.border.subtle,
    }]}>
      {hint !== null ? (
        <Text variant="caption" weight="medium" align="center" color={theme.colors.feedback.warning.base} style={s.hint}>
          {hint}
        </Text>
      ) : null}
      {children}
    </View>
  )
}

const s = StyleSheet.create({
  bar: { flexShrink: 0, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderTopWidth: 1 },
  hint: { marginBottom: spacing.xs },
})
