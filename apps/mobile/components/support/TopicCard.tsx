import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { ChevronRight } from 'lucide-react-native'
import { Text } from '@/components/ui'
import type { LucideIcon } from 'lucide-react-native'

interface TopicCardProps {
  Icon: LucideIcon
  title: string
  description: string
  /** Route to push when pressed. */
  route: string
  /** Whether to render the bottom hairline (last row should pass false). */
  showDivider?: boolean
}

/**
 * Wireframe `topic-row` (§(support)). 72h grid row, no card fill, relies on
 * a hairline between rows. Icon tile is brand-tinted 44×44.
 */
export function TopicCard({ Icon, title, description, route, showDivider = true }: TopicCardProps) {
  const { theme } = useUnistyles()
  const router = useRouter()

  return (
    <Pressable
      onPress={() => router.push(route as Parameters<typeof router.push>[0])}
      style={({ pressed }) => [
        s.row,
        showDivider && { borderBottomWidth: 1, borderBottomColor: theme.colors.border.subtle },
        pressed && { backgroundColor: theme.colors.surface.pressed },
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[s.icon, { backgroundColor: theme.colors.brand.primarySurface }]}>
        <Icon size={20} color={theme.colors.brand.primary} strokeWidth={2.25} />
      </View>
      <View style={s.body}>
        <Text style={[s.title, { color: theme.colors.content.primary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[s.desc, { color: theme.colors.content.secondary }]} numberOfLines={2}>
          {description}
        </Text>
      </View>
      <ChevronRight size={14} color={theme.colors.content.tertiary} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.075,
  },
  desc: {
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 3,
  },
})
