import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { Avatar } from '@/components/ui/Avatar'
import { formatConvoTime, formatFullName } from '@tenda/shared'
import type { Conversation } from '@tenda/shared'

interface ConversationItemProps {
  conversation: Conversation
  onPress: () => void
}

export function ConversationItem({ conversation, onPress }: ConversationItemProps) {
  const { theme } = useUnistyles()

  const { other_user, last_message, last_message_at, unread_count } = conversation
  const displayName =
    formatFullName(other_user.first_name, other_user.last_name) || 'Anonymous'

  const isUnread = unread_count > 0
  const time = last_message_at ? formatConvoTime(last_message_at) : ''

  const previewColor = isUnread
    ? theme.colors.content.primary
    : theme.colors.content.tertiary

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        { backgroundColor: pressed ? theme.colors.surface.pressed : 'transparent' },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open chat with ${displayName}`}
    >
      <Avatar
        size="md"
        name={displayName}
        src={other_user.avatar_url}
        unreadDot={isUnread}
      />

      <View style={s.body}>
        <Text
          style={[s.name, { color: theme.colors.content.primary }]}
          numberOfLines={1}
        >
          {displayName}
        </Text>
        <Text
          style={[s.preview, { color: previewColor }, isUnread && s.previewUnread]}
          numberOfLines={1}
        >
          {last_message ?? 'No messages yet'}
        </Text>
      </View>

      <View style={s.trail}>
        <Text
          style={[
            s.time,
            { color: isUnread ? theme.colors.brand.primary : theme.colors.content.tertiary },
          ]}
        >
          {time}
        </Text>
        {isUnread && (
          <View style={[s.unreadCount, { backgroundColor: theme.colors.brand.solid }]}>
            <Text style={[s.unreadCountText, { color: theme.colors.brand.onPrimary }]}>
              {unread_count > 9 ? '9+' : String(unread_count)}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 72,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  preview: {
    fontSize: 13,
    lineHeight: 17,
    marginTop: 3,
  },
  previewUnread: {
    fontWeight: '500',
  },
  trail: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  time: {
    fontFamily: typography.fonts.mono.medium,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '500',
    letterSpacing: 0.42,
  },
  unreadCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadCountText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
})
