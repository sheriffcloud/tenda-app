import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { MessageCircle } from 'lucide-react-native'
import { radius, spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { Spacer } from '@/components/ui/Spacer'

interface Props {
  reason: string
  /**
   * CO7: opens the shared mediation thread. Parties only, the caller
   * decides; omitted = no chat affordance (e.g. public viewers).
   */
  onOpenThread?: () => void
}

/** Danger-toned block showing the active dispute's reason. */
export function DisputeReasonBlock({ reason, onOpenThread }: Props) {
  const { theme } = useUnistyles()
  return (
    <View style={[s.block, { backgroundColor: theme.colors.feedback.danger.surface }]}>
      <Text weight="semibold" color={theme.colors.feedback.danger.text}>
        Dispute reason
      </Text>
      <Spacer size={4} />
      <Text variant="caption" color={theme.colors.feedback.danger.text}>
        {reason}
      </Text>
      {onOpenThread !== undefined && (
        <>
          <Spacer size={spacing.sm} />
          <Pressable onPress={onOpenThread} style={s.threadLink} hitSlop={8}>
            <MessageCircle size={14} color={theme.colors.feedback.danger.text} />
            <Text variant="caption" weight="semibold" color={theme.colors.feedback.danger.text}>
              Open dispute chat
            </Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  block: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  threadLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
})
