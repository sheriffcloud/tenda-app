import { Modal, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { radius, spacing } from '@/theme/tokens'
import { Button } from '../Button'
import { Spacer } from '../Spacer'
import { Text } from '../Text'
import { ModalBackdrop } from './ModalBackdrop'

export interface ConfirmDialogProps {
  visible: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  hideCancel?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { theme } = useUnistyles()

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <ModalBackdrop />
        <View
          accessibilityViewIsModal
          style={[
            s.card,
            {
              backgroundColor: theme.colors.surface.modal,
              borderColor: theme.colors.border.strong,
            },
          ]}
        >
          <Text variant="subheading">{title}</Text>
          {message !== undefined && message !== '' ? (
            <>
              <Spacer size={spacing.sm} />
              <Text variant="body" color={theme.colors.content.secondary}>{message}</Text>
            </>
          ) : null}
          <Spacer size={spacing.lg} />
          <View style={s.actionRow}>
            {!hideCancel ? (
              <Button variant="ghost" size="md" style={s.action} onPress={onCancel}>
                {cancelLabel}
              </Button>
            ) : null}
            <Button
              variant={destructive ? 'danger' : 'primary'}
              size="md"
              style={s.action}
              loading={loading}
              onPress={onConfirm}
            >
              {confirmLabel}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
})
