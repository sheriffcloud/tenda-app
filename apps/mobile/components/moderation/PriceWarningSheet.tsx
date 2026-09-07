import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { AlertTriangle } from 'lucide-react-native'
import type { ModerationReason } from '@tenda/shared'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { Spacer } from '@/components/ui/Spacer'

interface PriceWarningSheetProps {
  visible: boolean
  reasons: ModerationReason[]
  onPublishAnyway: () => void
  onEdit: () => void
}

/**
 * Warn-decision sheet (stage-6 § UX): shown before submitting a gig the
 * moderation pipeline flagged with warnings. "Publish anyway" proceeds,
 * the server records the acknowledgment alongside the verdict.
 */
export function PriceWarningSheet({ visible, reasons, onPublishAnyway, onEdit }: PriceWarningSheetProps) {
  const { theme } = useUnistyles()

  return (
    <BottomSheet visible={visible} onClose={onEdit} title="Before you publish">
      {reasons.map((r, i) => (
        <View key={`${r.code}-${i}`} style={s.reasonRow}>
          <AlertTriangle size={16} color={theme.colors.feedback.warning.base} />
          <Text size={13.5} color={theme.colors.content.secondary} style={s.reasonText}>
            {r.message}
          </Text>
        </View>
      ))}

      <Spacer size={12} />
      <Button variant="primary" size="lg" fullWidth onPress={onPublishAnyway}>
        Publish anyway
      </Button>
      <Spacer size={8} />
      <Button variant="ghost" size="md" fullWidth onPress={onEdit}>
        Edit gig
      </Button>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
  },
  reasonText: { flex: 1, lineHeight: 19 },
})
