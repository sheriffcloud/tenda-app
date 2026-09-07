import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Sparkles } from 'lucide-react-native'
import { Text } from './Text'

interface SeekerBadgeProps {
  /** compact: small inline pill for person cards; full: larger pill for profile hero */
  variant?: 'compact' | 'full'
  /** Override the label, defaults to "Seeker" / "Active seeker · Verified" */
  label?: string
}

export function SeekerBadge({ variant = 'compact', label }: SeekerBadgeProps) {
  const { theme } = useUnistyles()
  const isFull = variant === 'full'
  const text = label ?? (isFull ? 'Active seeker · Verified' : 'Seeker')
  return (
    <View
      style={[
        s.badge,
        isFull ? s.badgeFull : s.badgeCompact,
        { backgroundColor: theme.colors.accent.primarySurface },
      ]}
    >
      <Sparkles size={isFull ? 13 : 10} color={theme.colors.accent.primary} />
      <Text
        weight="bold"
        style={[
          isFull ? s.textFull : s.textCompact,
          { color: theme.colors.accent.primary },
        ]}
      >
        {text}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeCompact: {
    gap: 4,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 999,
  },
  badgeFull: {
    gap: 6,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 999,
  },
  textCompact: {
    fontSize: 10,
    letterSpacing: 0.1,
  },
  textFull: {
    fontSize: 11.5,
    letterSpacing: 0.115,
  },
})
