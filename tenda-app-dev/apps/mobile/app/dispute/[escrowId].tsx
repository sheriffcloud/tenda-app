/**
 * CO7 dispute-mediation thread, ONE shared conversation per dispute: both
 * parties and the mediating admin read the same messages. Polls the tail
 * (recursive setTimeout, chat cadence); freezes read-only once the dispute
 * resolves.
 *
 * Serves TWO seats. An admin reaches this screen through the "new dispute
 * message" push deep-link, so nothing here may assume a disputant is reading —
 * the seat comes from party membership (`disputeViewerSeat`), because the app
 * has no admin role of its own. Read access grants no voice: a mediator must
 * hold the claim to post, which the server enforces and `canPost` mirrors.
 */
import { useMemo, useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUnistyles } from 'react-native-unistyles'
import {
  resolveDisputeSender,
  disputeViewerSeat,
  type DisputeMessage,
  type DisputeSender,
} from '@tenda/shared'
import { ScreenContainer } from '@/components/ui/ScreenContainer'
import { Header } from '@/components/ui/Header'
import { Text } from '@/components/ui/Text'
import { ChatInput } from '@/components/ui/ChatInput'
import { AttachSheet } from '@/components/shared/AttachSheet'
import { MediaViewerModal } from '@/components/shared/media/MediaViewerModal'
import { ChatTimestampGroup } from '@/components/chat/ChatTimestampGroup'
import { ErrorState } from '@/components/feedback'
import { LoadingScreen } from '@/components/feedback/LoadingScreen'
import { showToast } from '@/components/ui/Toast'
import { DisputeMessageBubble } from '@/components/dispute/DisputeMessageBubble'
import { DisputeContextHeader } from '@/components/dispute/DisputeContextHeader'
import { useDisputeThread } from '@/hooks/useDisputeThread'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { useAttachmentUpload } from '@/hooks/useAttachmentUpload'
import { buildDisputeFeed, isDisputeDay } from '@tenda/shared'
import { disputeSendMessage } from '@tenda/shared'
import { attachmentToMediaItem } from '@/lib/attachments'
import { useAuthStore } from '@/stores/auth.store'
import { spacing } from '@/theme/tokens'
import type { MediaItem } from '@/components/shared/media/types'

export default function DisputeThreadScreen() {
  const { escrowId } = useLocalSearchParams<{ escrowId: string }>()
  const router = useRouter()
  const { theme } = useUnistyles()
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const myId = useAuthStore((s) => s.user?.id ?? '')
  const [attachOpen, setAttachOpen] = useState(false)
  const [viewing, setViewing] = useState<MediaItem | null>(null)

  const { loading, error, thread, messages, send, reload } = useDisputeThread(escrowId ?? null)

  const { uploading, pick } = useAttachmentUpload({
    type: 'dispute',
    scopeId: escrowId ?? null,
    onUploaded: async (attachment) => {
      const result = await send('', attachment)
      if (result !== 'sent') showToast('error', disputeSendMessage(result, 'Attachment'))
    },
  })

  // Day headers + consecutive-sender grouping, reversed for the inverted list.
  const feed = useMemo(() => buildDisputeFeed(messages), [messages])

  /**
   * Per-message sender identity. Derived from the escrow's party list, NOT
   * from "whoever isn't me" — that shortcut is only true from a disputant's
   * seat, and it silently labelled every bubble with the first party's name
   * for the mediator, who is the one person who must tell them apart.
   */
  function senderOf(message: DisputeMessage): DisputeSender {
    const context = thread?.context ?? null
    return resolveDisputeSender({
      senderId: message.sender_id,
      viewerId: myId,
      kind: context?.kind ?? null,
      parties: context?.parties ?? [],
    })
  }

  async function handleSend(text: string) {
    const result = await send(text)
    // A refusal the user cannot retry away (resolved thread, no claim) must not
    // be dressed up as "try again"; the hook has already frozen a resolved
    // thread, so the composer disappears alongside this toast.
    if (result !== 'sent') showToast('error', disputeSendMessage(result, 'Message'))
  }

  /**
   * Which seat is READING this screen. A mediating admin arrives here through
   * the "new dispute message" push deep-link, so every disputant-shaped string
   * below has to be gated — the app has no admin role of its own to check.
   * `unknown` (no party list yet) is treated as a disputant on purpose: the
   * cost of guessing wrong that way is stale copy, the other way it is a
   * disputant silently losing their composer.
   */
  const seat = disputeViewerSeat(thread?.context?.parties ?? [], myId)
  const isMediator = seat === 'mediator'
  /** Read access never implies a voice: a mediator must hold the claim to post. */
  const canPost =
    thread !== null && !thread.read_only && (!isMediator || thread.assigned_to_id === myId)

  if (loading) return <LoadingScreen />
  if (error !== null || thread === null) {
    return (
      <ScreenContainer>
        <Header title="Dispute" showBack onBackPress={() => router.back()} />
        <ErrorState
          title={error ?? 'Could not load the dispute thread'}
          ctaLabel="Try again"
          onCtaPress={() => void reload()}
        />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer scroll={false} padding={false}>
      <Header title="Dispute mediation" showBack onBackPress={() => router.back()} />
      {/* SDK 54 edge-to-edge: the OS never moves the window for the IME, so we
          do the avoidance ourselves — pad the column by the exact keyboard
          height (0 at rest, so no spurious gap when the keyboard hides). */}
      <View style={[s.flex, { paddingBottom: keyboardHeight }]}>
        {thread.context !== null && (
          <DisputeContextHeader context={thread.context} currentUserId={myId} />
        )}
        {!thread.read_only && isMediator && !canPost && (
          <View style={[s.banner, { backgroundColor: theme.colors.surface.inset }]}>
            <Text variant="caption" color={theme.colors.content.secondary}>
              You are viewing this as a mediator. Claim this dispute in the admin dashboard to
              reply.
            </Text>
          </View>
        )}
        {!thread.read_only && !isMediator && thread.assigned_to_id === null && (
          <View style={[s.banner, { backgroundColor: theme.colors.surface.inset }]}>
            <Text variant="caption" color={theme.colors.content.secondary}>
              An admin will join this conversation shortly. You can already talk to the other party.
            </Text>
          </View>
        )}
        {thread.read_only && (
          <View style={[s.banner, { backgroundColor: theme.colors.surface.inset }]}>
            <Text variant="caption" color={theme.colors.content.secondary}>
              This dispute is resolved, the conversation is read-only.
            </Text>
          </View>
        )}
        <FlatList
          data={feed}
          keyExtractor={(item) => (isDisputeDay(item) ? item._key : item.message.id)}
          renderItem={({ item }) =>
            isDisputeDay(item) ? (
              <ChatTimestampGroup iso={item.iso} />
            ) : (
              <DisputeMessageBubble
                message={item.message}
                sender={senderOf(item.message)}
                showSender={item.showSender}
                showTime={item.showTime}
                onAttachmentPress={(a) => setViewing(attachmentToMediaItem(a.id, a.url, a.type))}
              />
            )
          }
          inverted
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text variant="caption" color={theme.colors.content.tertiary} style={s.emptyText}>
                {isMediator
                  ? 'No messages yet.'
                  : 'No messages yet. Explain your side, the other party and the mediator see the same thread.'}
              </Text>
            </View>
          }
        />
        {uploading && (
          <Text size={12} color={theme.colors.content.tertiary} align="center" style={s.uploadingHint}>
            Uploading attachment…
          </Text>
        )}
        {canPost ? (
          <ChatInput
            onSend={(text) => void handleSend(text)}
            onAttach={() => setAttachOpen(true)}
            disabled={uploading}
          />
        ) : (
          // No composer for a resolved thread, or for a mediator who does not
          // hold the claim — the server refuses those posts, and an input that
          // always fails is worse than none. The ChatInput was also the only
          // element reserving the bottom safe-area, so without this spacer the
          // inverted list's newest message renders behind the Android nav bar.
          <View style={{ height: insets.bottom }} />
        )}
      </View>

      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPick={(kind) => {
          setAttachOpen(false)
          void pick(kind)
        }}
      />

      <MediaViewerModal item={viewing} onClose={() => setViewing(null)} />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingVertical: spacing.md },
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 10,
    padding: spacing.sm,
  },
  // Mirrors the chat screen: an inverted FlatList does not flip its
  // ListEmptyComponent in this RN version, so no counter-transform is needed —
  // adding one would render the copy upside-down.
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyText: { textAlign: 'center' },
  uploadingHint: { paddingVertical: 4 },
})
