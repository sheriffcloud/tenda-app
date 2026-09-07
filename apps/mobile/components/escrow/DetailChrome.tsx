import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronDown } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { FloatingChromeButton } from '@/components/ui'

interface Props {
  onBack: () => void
  /** Optional trailing action (share, edit, …). */
  rightIcon?: LucideIcon
  rightLabel?: string
  onRightPress?: () => void
}

/** Floating chrome row for modal detail screens (pattern §4.18). */
export function DetailChrome({ onBack, rightIcon, rightLabel, onRightPress }: Props) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[s.row, { top: insets.top + 12 }]} pointerEvents="box-none">
      <FloatingChromeButton Icon={ChevronDown} onPress={onBack} accessibilityLabel="Dismiss" />
      {rightIcon && onRightPress && (
        <FloatingChromeButton
          Icon={rightIcon}
          onPress={onRightPress}
          accessibilityLabel={rightLabel ?? 'Action'}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 30,
  },
})
