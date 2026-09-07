/**
 * Bottom sheet offering the two supported attachment sources — a photo or a
 * PDF document. Shared by the chat and dispute threads. Presentational: it
 * only reports the chosen kind; the caller owns picking + uploading (see
 * `useAttachmentUpload`).
 */
import { Pressable, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Image as ImageIcon, FileText } from 'lucide-react-native'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Text } from '@/components/ui/Text'
import type { AttachmentKind } from '@/hooks/useAttachmentUpload'

interface Props {
  visible: boolean
  onClose: () => void
  onPick: (kind: AttachmentKind) => void
}

export function AttachSheet({ visible, onClose, onPick }: Props) {
  const { theme } = useUnistyles()

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Attach">
      <Pressable
        style={({ pressed }) => [
          s.item,
          { borderTopColor: theme.colors.border.subtle },
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => onPick('image')}
        accessibilityRole="button"
        accessibilityLabel="Attach a photo"
      >
        <View style={[s.icon, { backgroundColor: theme.colors.surface.inset }]}>
          <ImageIcon size={18} color={theme.colors.brand.primary} />
        </View>
        <View style={s.body}>
          <Text size={15} weight="semibold" style={s.title}>Photo</Text>
          <Text size={12.5} color={theme.colors.content.secondary} style={s.desc}>
            JPG, PNG or WebP, up to 10 MB.
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          s.item,
          { borderTopColor: theme.colors.border.subtle },
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => onPick('document')}
        accessibilityRole="button"
        accessibilityLabel="Attach a document"
      >
        <View style={[s.icon, { backgroundColor: theme.colors.surface.inset }]}>
          <FileText size={18} color={theme.colors.brand.primary} />
        </View>
        <View style={s.body}>
          <Text size={15} weight="semibold" style={s.title}>Document</Text>
          <Text size={12.5} color={theme.colors.content.secondary} style={s.desc}>
            PDF, up to 10 MB.
          </Text>
        </View>
      </Pressable>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: { flex: 1 },
  title: { letterSpacing: -0.15 },
  desc: { lineHeight: 17.5, marginTop: 3 },
})
