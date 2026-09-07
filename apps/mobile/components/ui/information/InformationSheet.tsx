import { StyleSheet } from 'react-native'
import { spacing } from '@/theme/tokens'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'

interface InformationSheetProps {
  visible: boolean
  title: string
  description: string
  acknowledgeLabel?: string
  onClose: () => void
}

/** Non-blocking detail surface for explanatory copy hidden behind a summary. */
export function InformationSheet({
  visible,
  title,
  description,
  acknowledgeLabel = 'Got it',
  onClose,
}: InformationSheetProps) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <Text variant="body" style={s.description}>
        {description}
      </Text>
      <Button variant="primary" size="lg" fullWidth onPress={onClose}>
        {acknowledgeLabel}
      </Button>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  description: { marginBottom: spacing.lg },
})
