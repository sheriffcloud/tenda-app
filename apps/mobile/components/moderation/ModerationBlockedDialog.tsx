import { View, Modal, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ShieldX } from 'lucide-react-native'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { radius, spacing } from '@/theme/tokens'

interface ModerationBlockedDialogProps {
  visible: boolean
  /** User-facing reason from the server's block verdict. */
  message: string
  onEdit: () => void
}

/**
 * Block-decision dialog (stage-6 § UX): the gig cannot be published as
 * written. No retry path, the only exit is editing the content.
 */
export function ModerationBlockedDialog({ visible, message, onEdit }: ModerationBlockedDialogProps) {
  const { theme } = useUnistyles()

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: theme.colors.surface.card }]}>
          <ShieldX size={48} color={theme.colors.feedback.danger.base} />
          <Text variant="subheading" align="center" style={s.title}>
            This gig can&apos;t be published
          </Text>
          <Text size={13.5} color={theme.colors.content.secondary} align="center" style={s.body}>
            {message}
          </Text>
          <Button variant="primary" size="lg" fullWidth onPress={onEdit}>
            Edit gig
          </Button>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  title: { marginTop: spacing.xs },
  body: { lineHeight: 19 },
})
