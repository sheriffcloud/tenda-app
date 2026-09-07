import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { NotificationWire } from '@tenda/shared'
import { Text } from '@/components/ui'
import { formatRelativeShort } from '@tenda/shared'
import { notificationIcon } from '@/lib/notificationRoute'
import { spacing } from '@/theme/tokens'

interface NotificationRowProps {
  notification: NotificationWire
  onPress: () => void
}

export function NotificationRow({ notification, onPress }: NotificationRowProps) {
  const { theme } = useUnistyles()
  const unread = notification.read_at === null
  const Icon = notificationIcon(notification.data)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}${unread ? ', unread' : ''}`}
      style={({ pressed }) => [
        s.row,
        { backgroundColor: unread ? theme.colors.surface.inset : 'transparent' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[s.iconWrap, { backgroundColor: theme.colors.surface.background }]}>
        <Icon size={18} color={theme.colors.content.secondary} />
      </View>

      <View style={s.body}>
        <Text style={[s.title, { color: theme.colors.content.primary }]} numberOfLines={1}>
          {notification.title}
        </Text>
        <Text style={[s.text, { color: theme.colors.content.secondary }]} numberOfLines={2}>
          {notification.body}
        </Text>
        <Text style={[s.time, { color: theme.colors.content.tertiary }]}>
          {formatRelativeShort(notification.created_at)}
        </Text>
      </View>

      {unread && <View style={[s.dot, { backgroundColor: theme.colors.brand.solid }]} />}
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 14.5, fontWeight: '600', letterSpacing: -0.145 },
  text: { fontSize: 13.5, lineHeight: 18 },
  time: { fontSize: 12, marginTop: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
})
