import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import { AttachmentPreview } from '@/components/shared/media/AttachmentPreview'
import { useIsDark } from '@/lib/theme'
import type { AttachmentPress } from '@/lib/attachments'
import type { LocalMessage } from '@/stores/chat.store'

interface MessageBubbleProps {
  message:            LocalMessage
  isMine:             boolean
  onRetry?:           () => void
  onLongPress?:       () => void
  onAttachmentPress?: (attachment: AttachmentPress) => void
}

// Custom softer chat-bubble blues, derived from brand but desaturated
// so the conversation feels calmer than a flat saturated brand fill.
// Light: hue-aligned with brand.primary but less aggressive.
// Dark:  deeper muted variant, easier on the eye against --bg-dark.
const ME_BG_LIGHT = '#4365D2'
const ME_BG_DARK  = '#3F5BA8'

export function MessageBubble({ message, isMine, onRetry, onLongPress, onAttachmentPress }: MessageBubbleProps) {
  const { theme } = useUnistyles()
  const isDark = useIsDark()

  const isFailed  = message._status === 'failed'
  const isSending = message._status === 'sending'

  // Their bubble: warm/calm surface, slightly softened in dark from raw --inset
  const themBg = isDark ? '#1B2231' : theme.colors.surface.inset
  const meBg = isDark ? ME_BG_DARK : ME_BG_LIGHT

  const bubbleBg = isMine
    ? (isFailed ? theme.colors.surface.card : meBg)
    : themBg

  const textColor = isMine && !isFailed
    ? '#FFFFFF'
    : theme.colors.content.primary

  const containerStyle = [s.row, isMine ? s.rowMine : s.rowTheirs]

  const attachmentUrl = message.attachment_url
  const attachmentType = message.attachment_type

  return (
    <View style={containerStyle}>
      <View style={s.column}>
        <Pressable
          onPress={isFailed && onRetry ? onRetry : undefined}
          onLongPress={!isMine ? onLongPress : undefined}
          style={({ pressed }) => [
            s.bubble,
            isMine ? s.bubbleMine : s.bubbleTheirs,
            { backgroundColor: bubbleBg },
            isMine && !isFailed && s.bubbleMineShadow,
            isMine && !isFailed && { shadowColor: meBg },
            isFailed && [s.bubbleFailed, { borderColor: theme.colors.feedback.danger.base }],
            pressed && (isFailed || (!isMine && onLongPress)) && s.bubblePressed,
          ]}
        >
          {attachmentUrl !== null && attachmentType !== null && (
            <AttachmentPreview
              url={attachmentUrl}
              type={attachmentType}
              textColor={textColor}
              onPress={() =>
                onAttachmentPress?.({ id: message.id, url: attachmentUrl, type: attachmentType })
              }
              onLongPress={!isMine ? onLongPress : undefined}
            />
          )}

          {message.content.length > 0 && (
            <Text style={[s.content, { color: textColor }, attachmentUrl !== null && s.contentBelowAttachment]}>
              {message.content}
            </Text>
          )}

          {isFailed && (
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [s.retryRow, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Retry sending message"
              accessibilityRole="button"
            >
              <Text size={11.5} color={theme.colors.feedback.danger.base}>
                Didn&apos;t send
              </Text>
              <Text size={11.5} color={theme.colors.content.tertiary}>·</Text>
              <Text size={11.5} weight="semibold" color={theme.colors.feedback.danger.base}>
                Retry
              </Text>
            </Pressable>
          )}
        </Pressable>

        {isSending && (
          <Text size={11} color={theme.colors.content.tertiary} style={s.statusLine}>
            Sending…
          </Text>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginTop: 2,
    paddingHorizontal: 16,
  },
  rowMine:   { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  column: {
    maxWidth: '78%',
    flexDirection: 'column',
  },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleMine: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 18,
  },
  bubbleMineShadow: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 2,
  },
  bubbleFailed: {
    borderWidth: 1,
  },
  bubblePressed: { opacity: 0.85 },
  content: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  contentBelowAttachment: {
    marginTop: 6,
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  statusLine: {
    marginTop: 4,
    alignSelf: 'flex-end',
  },
})
