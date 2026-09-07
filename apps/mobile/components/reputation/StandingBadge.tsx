import { useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import { useUserStanding } from '@/hooks/useStanding'
import { StandingDetailSheet } from './StandingDetailSheet'

interface StandingBadgeProps {
  userId: string
  displayName: string
}

/**
 * Inline standing chip (stage-7 § mobile): completion % (or "New user")
 * plus a "Limited" marker for publicly visible restrictions. Tapping
 * opens the breakdown sheet. Renders nothing until standing is loaded,
 * it is decorative, never blocking.
 */
export function StandingBadge({ userId, displayName }: StandingBadgeProps) {
  const { theme } = useUnistyles()
  const standing = useUserStanding(userId)
  const [open, setOpen] = useState(false)

  if (standing === null) return null

  const label =
    standing.completion_rate !== null
      ? `${Math.round(standing.completion_rate * 100)}% completion`
      : 'New user'

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={({ pressed }) => [
          s.chip,
          { backgroundColor: theme.colors.surface.inset },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Standing: ${label}`}
      >
        <Text size={11.5} color={theme.colors.content.secondary}>{label}</Text>
        {standing.is_limited && (
          <Text size={11.5} weight="semibold" color={theme.colors.feedback.warning.base}>
            · Limited
          </Text>
        )}
      </Pressable>

      <StandingDetailSheet
        visible={open}
        onClose={() => setOpen(false)}
        standing={standing}
        displayName={displayName}
      />
    </>
  )
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
})
