/**
 * Inline preview of a message attachment inside a chat/dispute bubble: an
 * image thumbnail or a document chip. Presentational only — it renders no
 * viewer and pulls no native download deps, so it stays safe to mount in any
 * bubble and any jest suite. Tapping it delegates to `onPress`; the SCREEN
 * owns the full-screen MediaViewerModal (mirrors the ProofsGrid pattern).
 */
import { Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { FileText } from 'lucide-react-native'
import { Text } from '@/components/ui/Text'
import type { MessageAttachmentType } from '@tenda/shared'

interface Props {
  url: string
  type: MessageAttachmentType
  /** Chip label/icon colour, so the preview matches its bubble's text. */
  textColor: string
  onPress: () => void
  /**
   * Forwarded to the preview's own Pressable. Without this, a long-press on
   * the image/chip is captured here and never reaches the bubble — so an
   * image-only message could not be long-pressed to report.
   */
  onLongPress?: () => void
}

export function AttachmentPreview({ url, type, textColor, onPress, onLongPress }: Props) {
  if (type === 'image') {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="imagebutton"
        accessibilityLabel="Open image attachment"
      >
        <Image source={{ uri: url }} style={s.image} contentFit="cover" />
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.fileChip, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel="Open document attachment"
    >
      <FileText size={16} color={textColor} />
      <Text size={13} weight="medium" color={textColor}>
        Document
      </Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  image: {
    width: 220,
    height: 220,
    borderRadius: 12,
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
})
