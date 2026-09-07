import { useCallback, useState, useMemo } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { MessageCircle } from 'lucide-react-native'
import { ScreenContainer, Text, Header } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/feedback'
import { ConversationItem } from '@/components/chat/ConversationItem'
import { useChatStore } from '@/stores/chat.store'
import { typography } from '@/theme/tokens'
import type { Conversation } from '@tenda/shared'

type FeedItem =
  | { type: 'header'; key: string; label: string }
  | { type: 'convo'; key: string; conversation: Conversation }

export default function MessagesScreen() {
  const { theme } = useUnistyles()
  const router = useRouter()
  const { conversations, fetchConversations } = useChatStore()
  const [fetchError, setFetchError] = useState(false)

  const load = useCallback(() => {
    setFetchError(false)
    fetchConversations().catch(() => setFetchError(true))
  }, [fetchConversations])

  useFocusEffect(load)

  const unread = useMemo(
    () => conversations.filter((c) => c.unread_count > 0),
    [conversations],
  )
  const earlier = useMemo(
    () => conversations.filter((c) => c.unread_count === 0),
    [conversations],
  )

  const feed: FeedItem[] = useMemo(() => {
    const out: FeedItem[] = []
    if (unread.length > 0) {
      out.push({ type: 'header', key: 'h-unread', label: 'Unread' })
      for (const c of unread) out.push({ type: 'convo', key: c.id, conversation: c })
    }
    if (earlier.length > 0) {
      out.push({ type: 'header', key: 'h-earlier', label: 'Earlier' })
      for (const c of earlier) out.push({ type: 'convo', key: c.id, conversation: c })
    }
    return out
  }, [unread, earlier])

  const subtitle = unread.length > 0
    ? `${unread.length} unread thread${unread.length === 1 ? '' : 's'}`
    : undefined

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
      <Header variant="large" title="Messages" subtitle={subtitle} />
      <FlatList
        data={feed}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text style={[s.groupHeader, { color: theme.colors.content.tertiary }]}>
              {item.label.toUpperCase()}
            </Text>
          ) : (
            <ConversationItem
              conversation={item.conversation}
              onPress={() => router.push(`/chat/${item.conversation.other_user.id}` as Parameters<typeof router.push>[0])}
            />
          )
        }
        ListEmptyComponent={
          <View style={s.emptyWrapper}>
            {fetchError ? (
              <ErrorState
                title="Couldn't load messages"
                description="Check your connection and try again."
                ctaLabel="Retry"
                onCtaPress={load}
              />
            ) : (
              <EmptyState
                icon={<MessageCircle size={30} color={theme.colors.brand.primary} />}
                title="No conversations yet"
                description="Start a conversation by messaging a gig poster or worker."
              />
            )}
          </View>
        }
        contentContainerStyle={feed.length === 0 ? s.emptyContainer : undefined}
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  groupHeader: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 1.0,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  emptyWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: { flex: 1 },
})
