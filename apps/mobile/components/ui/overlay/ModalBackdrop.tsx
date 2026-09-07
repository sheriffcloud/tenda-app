import { Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'

interface ModalBackdropProps {
  onPress?: () => void
}

export function ModalBackdrop({ onPress }: ModalBackdropProps) {
  const { theme } = useUnistyles()

  return (
    <Pressable
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={onPress === undefined ? undefined : 'Close dialog'}
      onPress={onPress}
      style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.utility.scrim }]}
      testID="modal-backdrop"
    />
  )
}
