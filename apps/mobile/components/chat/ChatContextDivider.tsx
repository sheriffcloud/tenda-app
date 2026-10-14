import { View, Pressable, StyleSheet } from 'react-native'
import { Briefcase, ArrowLeftRight } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'

interface Props {
  escrowId?: string | null
  escrowTitle?: string | null
  /** Routes the pill to the right detail surface; null = unknown → gig. */
  kind?: 'gig' | 'exchange' | null
}

export function ChatContextDivider({ escrowId, escrowTitle, kind }: Props) {
  const { theme } = useUnistyles()
  const router = useRouter()

  const isOffer = kind === 'exchange'
  const contextId = escrowId ?? null
  const title = escrowTitle ?? (isOffer ? 'View offer' : 'View gig')
  const label = isOffer ? 'Trade' : 'Gig'
  const Icon = isOffer ? ArrowLeftRight : Briefcase
  const path = isOffer
    ? `/exchange/${escrowId}` as Parameters<typeof router.push>[0]
    : `/gig/${escrowId}` as Parameters<typeof router.push>[0]

  if (!contextId) {
    return (
      <View style={s.row}>
        <View style={[s.pill, { backgroundColor: theme.colors.surface.inset }]}>
          <Text style={[s.pillText, { color: theme.colors.content.secondary }]}>
            DIRECT MESSAGE
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={s.row}>
      <Pressable
        onPress={() => router.push(path)}
        style={({ pressed }) => [
          s.pill,
          { backgroundColor: theme.colors.surface.inset },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label}: ${title}`}
      >
        <Icon size={11} color={theme.colors.brand.primary} />
        <Text style={[s.pillText, { color: theme.colors.content.secondary }]}>
          {label.toUpperCase()}
        </Text>
        <Text style={[s.dash, { color: theme.colors.content.tertiary }]}>·</Text>
        <Text
          style={[s.title, { color: theme.colors.content.primary }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  pill: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '90%',
  },
  pillText: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.42,
  },
  dash: {
    fontSize: 12,
    lineHeight: 14,
  },
  title: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.42,
    flexShrink: 1,
  },
})
