import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Megaphone } from 'lucide-react-native'
import type { AnnouncementWire } from '@tenda/shared'
import { Text } from '@/components/ui'
import { spacing } from '@/theme/tokens'

interface AnnouncementCardProps {
  announcement: AnnouncementWire
}

/**
 * A pinned, informational broadcast banner. No PER-CARD read state: the whole
 * pinned set is cleared at once by mark-all-read, which advances the viewer's
 * `announcements_read_at` cursor, and the server then stops serving them. So
 * the card never renders a read/unread distinction — everything it is handed
 * is unread by construction.
 */
export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  const { theme } = useUnistyles()

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.colors.surface.inset, borderColor: theme.colors.border.subtle },
      ]}
    >
      <View style={s.head}>
        <Megaphone size={16} color={theme.colors.brand.primary} />
        <Text style={[s.title, { color: theme.colors.content.primary }]} numberOfLines={2}>
          {announcement.title}
        </Text>
      </View>
      <Text style={[s.body, { color: theme.colors.content.secondary }]}>{announcement.body}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: { flex: 1, fontSize: 14.5, fontWeight: '600', letterSpacing: -0.145 },
  body: { fontSize: 13.5, lineHeight: 19 },
})
