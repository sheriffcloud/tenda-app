import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Menu } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { APP_INFO } from '@tenda/shared'
import { Text, Avatar } from '@/components/ui'

interface DrawerHeaderProps {
  title?: string
  onMenuPress: () => void
  rightIcon?: LucideIcon
  onRightPress?: () => void
  /** Unread count shown as a bubble over the right icon (hidden when 0). */
  badgeCount?: number
  onAvatarPress?: () => void
  userImage?: string | null
  userName?: string
  showAvatar?: boolean
}

export function DrawerHeader({
  title = APP_INFO.name,
  onMenuPress,
  rightIcon: RightIcon,
  onRightPress,
  badgeCount = 0,
  onAvatarPress,
  userImage,
  userName,
  showAvatar = true,
}: DrawerHeaderProps) {
  const { theme } = useUnistyles()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        s.hdr,
        {
          // Edge-to-edge (SDK 54): the bar draws behind the status bar, so its
          // height is the 56px content row PLUS the inset, paddingTop must add
          // to the height, never eat into a fixed one (that clipped the icons
          // and spilled them into the body).
          paddingTop: insets.top,
          height: 56 + insets.top,
          backgroundColor: theme.colors.surface.background,
          borderBottomColor: theme.colors.border.subtle,
        },
      ]}
    >
      <Pressable
        onPress={onMenuPress}
        style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel="Open menu"
        accessibilityRole="button"
      >
        <Menu size={18} color={theme.colors.content.secondary} />
      </Pressable>

      <View style={s.center}>
        <Text style={[s.title, { color: theme.colors.content.primary }]} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <View style={s.right}>
        {RightIcon && (
          <Pressable
            onPress={onRightPress}
            style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <RightIcon size={18} color={theme.colors.content.secondary} />
            {badgeCount > 0 && (
              <View style={[s.badge, { backgroundColor: theme.colors.brand.solid, borderColor: theme.colors.surface.background }]}>
                <Text style={[s.badgeText, { color: theme.colors.brand.onPrimary }]} numberOfLines={1}>
                  {badgeCount > 99 ? '99+' : badgeCount}
                </Text>
              </View>
            )}
          </Pressable>
        )}
        {showAvatar && (
          <Pressable onPress={onAvatarPress} hitSlop={4}>
            <Avatar src={userImage} name={userName} size="sm" />
          </Pressable>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.17,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
