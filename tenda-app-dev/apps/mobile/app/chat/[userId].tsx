import { useMemo, useState } from 'react'
import {
  FlatList,
  StyleSheet,
  View,
  Pressable,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Ban } from 'lucide-react-native'
import { ScreenContainer } from '@/components/ui/ScreenContainer'
import { Text } from '@/components/ui/Text'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { AttachSheet } from '@/components/shared/AttachSheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorState } from '@/components/feedback'
import { ReportSheet } from '@/components/moderation/ReportSheet'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ChatContextDivider } from '@/components/chat/ChatContextDivider'
import { ChatTimestampGroup } from '@/components/chat/ChatTimestampGroup'
import { buildMessageFeed, formatFullName, isDivider, isTimestamp } from '@tenda/shared'
import { ChatHeader } from '@/components/chat/ChatHeader'
import { ChatInput } from '@/components/ui/ChatInput'
import { MediaViewerModal } from '@/components/shared/media/MediaViewerModal'
import { LoadingScreen } from '@/components/feedback/LoadingScreen'
import { showToast } from '@/components/ui/Toast'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { useConversation } from '@/hooks/useConversation'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { useChatRealtime } from '@/hooks/useChatRealtime'
import { useAttachmentUpload } from '@/hooks/useAttachmentUpload'
import { attachmentToMediaItem } from '@/lib/attachments'
import { spacing } from '@/theme/tokens'
import type { MediaItem } from '@/components/shared/media/types'
import type { LocalMessage } from '@/stores/chat.store'

export default function ChatScreen() {
  const { userId, escrowId, escrowTitle, kind } = useLocalSearchParams<{
    userId: string
    escrowId?: string
    escrowTitle?: string
    kind?: 'gig' | 'exchange'
  }>()
  const router = useRouter()
  const { theme } = useUnistyles()
  const myId = useAuthStore((s) => s.user?.id ?? '')
  const { sendMessage, retryMessage, closeConversation, messages } = useChatStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [viewing, setViewing] = useState<MediaItem | null>(null)
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null)
  const [closeConfirm, setCloseConfirm] = useState(false)
  const [closing, setClosing] = useState(false)

  const { conversationId, otherUser, loading, initError, retry } = useConversation(userId)
  useChatRealtime(conversationId)
  const keyboardHeight = useKeyboardHeight()

  const feed = useMemo(() => {
    const msgs = conversationId ? (messages[conversationId] ?? []) : []
    // Shared builder is chronological; the inverted FlatList wants newest first.
    return buildMessageFeed(msgs).reverse()
  }, [conversationId, messages])

  const escrowContext = escrowId ? { escrowId, kind: kind ?? null } : undefined

  const { uploading, pick } = useAttachmentUpload({
    type: 'chat',
    scopeId: conversationId,
    onUploaded: (attachment) => {
      if (conversationId) void sendMessage(conversationId, '', escrowContext, attachment)
    },
  })

  function handleSend(text: string) {
    if (!conversationId) return
    void sendMessage(conversationId, text, escrowContext)
  }

  function handleRetry(msg: LocalMessage) {
    if (!conversationId) return
    retryMessage(conversationId, msg)
  }

  function handleCloseConversation() {
    if (!conversationId) return
    setMenuOpen(false)
    setCloseConfirm(true)
  }

  async function confirmCloseConversation() {
    if (!conversationId) return
    setClosing(true)
    try {
      await closeConversation(conversationId)
      setCloseConfirm(false)
      router.back()
    } catch {
      showToast('error', 'Failed to close conversation, please try again')
    } finally {
      setClosing(false)
    }
  }

  if (loading) return <LoadingScreen />

  if (initError) {
    return (
      <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
        <ChatHeader name="Chat" onBack={() => router.back()} />
        <ErrorState
          title="Couldn't open chat"
          description="There was a problem starting this conversation."
          ctaLabel="Retry"
          onCtaPress={retry}
        />
      </ScreenContainer>
    )
  }

  const displayName = otherUser
    ? formatFullName(otherUser.first_name, otherUser.last_name) || 'Anonymous'
    : 'User'

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
      {/* SDK 54 edge-to-edge: the OS never moves the window for the IME, so we
          do the avoidance ourselves — pad the column by the exact keyboard
          height (0 at rest, so no spurious gap when the keyboard hides). */}
      <View style={[s.flex, { paddingBottom: keyboardHeight }]}>
        <ChatHeader
          name={displayName}
          avatarUrl={otherUser?.avatar_url}
          onBack={() => router.back()}
          onMenu={() => setMenuOpen(true)}
        />

        <FlatList
          data={feed}
          keyExtractor={(item) =>
            isDivider(item) || isTimestamp(item) ? item._key : item.id
          }
          renderItem={({ item }) => {
            if (isDivider(item)) {
              return (
                <ChatContextDivider
                  escrowId={item.escrow_id}
                  escrowTitle={item.escrow_title}
                  kind={item.escrow_kind}
                />
              )
            }
            if (isTimestamp(item)) {
              return <ChatTimestampGroup iso={item.iso} />
            }
            return (
              <MessageBubble
                message={item}
                isMine={item.sender_id === myId}
                onRetry={item._status === 'failed' ? () => handleRetry(item) : undefined}
                onLongPress={item.sender_id !== myId ? () => setReportingMessageId(item.id) : undefined}
                onAttachmentPress={(a) => setViewing(attachmentToMediaItem(a.id, a.url, a.type))}
              />
            )
          }}
          contentContainerStyle={s.messageList}
          showsVerticalScrollIndicator={false}
          inverted
          ListEmptyComponent={
            <View style={s.empty}>
              <Text variant="body" color={theme.colors.content.tertiary} align="center">
                No messages yet. Say hi!
              </Text>
            </View>
          }
        />

        {escrowId && (
          <ChatContextDivider
            escrowId={escrowId}
            escrowTitle={escrowTitle ? decodeURIComponent(escrowTitle) : null}
            kind={kind ?? null}
          />
        )}
        {uploading && (
          <Text size={12} color={theme.colors.content.tertiary} align="center" style={s.uploadingHint}>
            Uploading attachment…
          </Text>
        )}
        <ChatInput onSend={handleSend} onAttach={() => setAttachOpen(true)} disabled={uploading} />
      </View>

      {reportingMessageId !== null && (
        <ReportSheet
          visible
          onClose={() => setReportingMessageId(null)}
          contentType="message"
          contentId={reportingMessageId}
        />
      )}

      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPick={(pickKind) => {
          setAttachOpen(false)
          void pick(pickKind)
        }}
      />

      <MediaViewerModal item={viewing} onClose={() => setViewing(null)} />

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Options">
        <Pressable
          style={({ pressed }) => [
            s.menuItem,
            { borderTopColor: theme.colors.border.subtle },
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleCloseConversation}
          accessibilityRole="button"
          accessibilityLabel="Close conversation"
        >
          <View style={[s.menuIcon, { backgroundColor: theme.colors.feedback.danger.surface }]}>
            <Ban size={18} color={theme.colors.feedback.danger.base} />
          </View>
          <View style={s.menuBody}>
            <Text size={15} weight="semibold" color={theme.colors.feedback.danger.base} style={s.menuTitle}>
              Close conversation
            </Text>
            <Text size={12.5} color={theme.colors.content.secondary} style={s.menuDesc}>
              You&apos;ll stop seeing this thread in Messages. It reopens if either of you sends a new message.
            </Text>
          </View>
        </Pressable>
      </BottomSheet>

      <ConfirmDialog
        visible={closeConfirm}
        title="Close conversation"
        message="This will hide the conversation from your inbox. It will reopen if you message again."
        confirmLabel="Close"
        destructive
        loading={closing}
        onConfirm={() => void confirmCloseConversation()}
        onCancel={() => setCloseConfirm(false)}
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  flex:        { flex: 1 },
  messageList: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
  empty:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuBody: { flex: 1 },
  uploadingHint: { paddingVertical: 4 },
  menuTitle: { letterSpacing: -0.15 },
  menuDesc: { lineHeight: 17.5, marginTop: 3 },
})
