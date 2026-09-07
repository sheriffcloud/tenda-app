import { View, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUnistyles } from 'react-native-unistyles'
import { ChevronLeft, MoreVertical } from 'lucide-react-native'
import { Text } from '@/components/ui/Text'
import { Avatar } from '@/components/ui/Avatar'

interface ChatHeaderProps {
  name: string
  avatarUrl?: string | null
  /** Optional presence string ("Online" / "Last seen 2h ago"). Hidden when null. */
  presence?: string | null
  /** Whether the presence dot should render in success tone. */
  online?: boolean
  onBack: () => void
  onMenu?: () => void
}

/**
 * Wireframe `chat-hdr` (§messages-chat). 64h row with back arrow, avatar-sm,
 * name + optional presence line, and trailing menu trigger. Replaces the
 * generic `Header` for chat threads.
 */
export function ChatHeader({ name, avatarUrl, presence, online, onBack, onMenu }: ChatHeaderProps) {
  const { theme } = useUnistyles()
  // Edge-to-edge (SDK 54): the app draws behind the status bar and the enclosing
  // ScreenContainer never claims the top edge, so the header owns the top inset
  // here, mirroring the generic `Header`.
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        s.row,
        { paddingTop: insets.top, height: s.row.height + insets.top },
        { backgroundColor: theme.colors.surface.background, borderBottomColor: theme.colors.border.subtle },
      ]}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={({ pressed }) => [s.icBtn, pressed && { opacity: 0.6 }]}
      >
        <ChevronLeft size={22} color={theme.colors.content.primary} strokeWidth={2.25} />
      </Pressable>

      <View style={s.id}>
        <Avatar size="sm" name={name} src={avatarUrl ?? null} />
        <View style={s.idBody}>
          <Text style={[s.name, { color: theme.colors.content.primary }]} numberOfLines={1}>
            {name}
          </Text>
          {presence ? (
            <View style={s.presence}>
              <View
                style={[
                  s.dot,
                  {
                    backgroundColor: online
                      ? theme.colors.feedback.success.base
                      : theme.colors.content.tertiary,
                  },
                ]}
              />
              <Text style={[s.presenceText, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
                {presence}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {onMenu && (
        <Pressable
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel="More options"
          hitSlop={8}
          style={({ pressed }) => [s.icBtn, pressed && { opacity: 0.6 }]}
        >
          <MoreVertical size={20} color={theme.colors.content.primary} strokeWidth={2.25} />
        </Pressable>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    height: 64,
    paddingLeft: 8,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    flexShrink: 0,
  },
  icBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  id: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  idBody: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.16,
  },
  presence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  presenceText: {
    fontSize: 11.5,
    lineHeight: 14,
    flexShrink: 1,
  },
})
