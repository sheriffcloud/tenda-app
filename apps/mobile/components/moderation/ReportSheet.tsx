import { useState } from 'react'
import { View, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native'
import { Check } from 'lucide-react-native'
import { useUnistyles } from 'react-native-unistyles'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { api } from '@/api/client'
import { spacing, radius } from '@/theme/tokens'
import { REPORT_REASONS, REPORT_REASON_LABEL } from '@tenda/shared'
import type { ReportContentType, ReportReason } from '@tenda/shared'

interface Props {
  visible:      boolean
  onClose:      () => void
  contentType:  ReportContentType
  contentId:    string
  onSuccess?:   () => void
}

export function ReportSheet({ visible, onClose, contentType, contentId, onSuccess }: Props) {
  const { theme } = useUnistyles()
  const [reason, setReason]     = useState<ReportReason | null>(null)
  const [note, setNote]         = useState('')
  const [loading, setLoading]   = useState(false)

  function handleClose() {
    if (loading) return
    setReason(null)
    setNote('')
    onClose()
  }

  async function handleSubmit() {
    if (!reason || loading) return
    setLoading(true)
    try {
      await api.reports.create({ content_type: contentType, content_id: contentId, reason, note: note.trim() || undefined })
      showToast('success', 'Report submitted, our team will review it.')
      handleClose()
      onSuccess?.()
    } catch {
      showToast('error', 'Failed to submit report, please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Report">
      <Text variant="caption" color={theme.colors.content.secondary} style={s.label}>
        Why are you reporting this?
      </Text>

      {REPORT_REASONS.map((r) => {
        const selected = reason === r
        return (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            style={({ pressed }) => [
              s.option,
              { borderColor: selected ? theme.colors.brand.primary : theme.colors.border.default },
              { backgroundColor: selected ? theme.colors.brand.primarySurface : theme.colors.surface.card },
              pressed && !selected && { backgroundColor: theme.colors.surface.pressed },
            ]}
          >
            <Text variant="body" weight={selected ? 'semibold' : 'regular'}>
              {REPORT_REASON_LABEL[r]}
            </Text>
            {selected && <Check size={16} color={theme.colors.brand.primary} />}
          </Pressable>
        )
      })}

      <Text variant="caption" color={theme.colors.content.secondary} style={[s.label, s.labelTop]}>
        Additional context (optional)
      </Text>
      <TextInput
        value={note}
        onChangeText={(t) => setNote(t.slice(0, 500))}
        placeholder="Describe the issue…"
        placeholderTextColor={theme.colors.content.tertiary}
        multiline
        maxLength={500}
        style={[
          s.input,
          {
            color:           theme.colors.content.primary,
            borderColor:     theme.colors.border.default,
            backgroundColor: theme.colors.surface.card,
          },
        ]}
      />
      <Text variant="caption" color={theme.colors.content.tertiary} align="right">
        {note.length}/500
      </Text>

      <View style={s.footer}>
        {loading ? (
          <ActivityIndicator color={theme.colors.brand.primary} />
        ) : (
          <Button
            onPress={handleSubmit}
            disabled={!reason}
            variant="primary"
            fullWidth
          >
            Submit report
          </Button>
        )}
      </View>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  label:    { marginBottom: spacing.xs },
  labelTop: { marginTop: spacing.md },
  option: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius:      radius.md,
    borderWidth:       1,
    marginBottom:      spacing.xs,
  },
  input: {
    minHeight:         80,
    borderWidth:       1,
    borderRadius:      radius.md,
    padding:           spacing.sm,
    textAlignVertical: 'top',
    fontSize:          14,
  },
  footer: {
    marginTop: spacing.lg,
  },
})
