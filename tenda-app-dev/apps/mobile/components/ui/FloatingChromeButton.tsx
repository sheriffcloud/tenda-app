import { Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { LucideIcon } from 'lucide-react-native'

interface Props {
  Icon: LucideIcon
  onPress: () => void
  accessibilityLabel: string
}

/**
 * 36×36 ghost icon button used on modal-style detail screens (gig/[id], exchange/[id]).
 * Sits floating over the scroll content with a translucent inset fill, gives the
 * "no header bar" wireframe look. (When expo-blur ships, swap the bg for a BlurView.)
 */
export function FloatingChromeButton({ Icon, onPress, accessibilityLabel }: Props) {
  const { theme } = useUnistyles()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        s.btn,
        {
          backgroundColor: theme.colors.surface.card,
          borderColor: theme.colors.border.subtle,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon size={16} color={theme.colors.content.primary} strokeWidth={2.25} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
