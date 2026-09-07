import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUnistyles } from 'react-native-unistyles'
import { radius, spacing } from '@/theme/tokens'
import { Text } from '../Text'
import { ModalBackdrop } from './ModalBackdrop'
import {
  MINIMUM_SHEET_BOTTOM_INSET,
  SHEET_CONTENT_BOTTOM_PADDING,
  SHEET_MAXIMUM_HEIGHT,
} from './overlay.constants'

export interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  title: string
  children: ReactNode
  headerRight?: ReactNode
  scrollable?: boolean
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  headerRight,
  scrollable = true,
}: BottomSheetProps) {
  const { theme } = useUnistyles()
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, MINIMUM_SHEET_BOTTOM_INSET)
  const bodyStyle = [s.body, { paddingBottom: SHEET_CONTENT_BOTTOM_PADDING + bottomInset }]

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ModalBackdrop onPress={onClose} />
        <View
          accessibilityViewIsModal
          style={[
            s.sheet,
            {
              backgroundColor: theme.colors.surface.sheet,
              borderColor: theme.colors.border.strong,
            },
          ]}
        >
          <View style={[s.grabber, { backgroundColor: theme.colors.border.strong }]} />
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            {headerRight}
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [
                s.closeButton,
                { backgroundColor: theme.colors.surface.inset },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel="Close sheet"
              accessibilityRole="button"
            >
              <X size={16} color={theme.colors.content.secondary} />
            </Pressable>
          </View>
          {scrollable ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={bodyStyle}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[bodyStyle, s.staticBody]}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: SHEET_MAXIMUM_HEIGHT,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing['2xs'],
    marginBottom: spacing.xs,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['2xs'],
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: { flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: spacing.lg },
  staticBody: { flexShrink: 1 },
})
