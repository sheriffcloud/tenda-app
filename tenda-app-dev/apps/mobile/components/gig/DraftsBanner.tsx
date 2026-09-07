/**
 * "You have N drafts" — the entry point to /my-gigs/drafts.
 *
 * Drafts used to be a fourth tab on My Gigs. At four tabs the row could not fit
 * a label and a multi-digit count chip on a narrow screen, and drafts were the
 * tab to give up: a staging state users pass through, not a listing they
 * browse. Rendering nothing at zero also means the majority who never save a
 * draft stop carrying a permanently empty tab.
 *
 * It sits in the Posted list's HEADER rather than above the pager. Above the
 * pager it would be a fourth stacked row of screen furniture (header, tabs,
 * chain chips, this) permanently eating vertical space; as a list header it
 * scrolls away with the content. Posted is the default page, so it is still on
 * screen when My Gigs opens.
 */
import { Pressable, View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { FileClock, ChevronRight } from 'lucide-react-native'
import { Text } from '@/components/ui/Text'
import { spacing, radius } from '@/theme/tokens'

interface DraftsBannerProps {
  count: number
  onPress: () => void
}

export function DraftsBanner({ count, onPress }: DraftsBannerProps) {
  const { theme } = useUnistyles()

  // Nothing to nudge about. Callers also gate on `hasFetched` so this is never
  // the "you have no drafts" claim made before the first response lands.
  if (count <= 0) return null

  const label = count === 1 ? '1 draft' : `${count} drafts`

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, not yet posted. Open drafts.`}
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: theme.colors.surface.inset,
          borderColor: theme.colors.border.subtle,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[s.icon, { backgroundColor: theme.colors.brand.primarySurface }]}>
        <FileClock size={18} color={theme.colors.brand.primary} />
      </View>

      <View style={s.copy}>
        <Text weight="semibold" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" color={theme.colors.content.secondary} numberOfLines={1}>
          Not funded yet — nobody else can see these
        </Text>
      </View>

      <ChevronRight size={18} color={theme.colors.content.tertiary} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.card,
    marginBottom: spacing.md,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Takes the slack so the chevron stays pinned right and the copy truncates
  // rather than pushing it off the card.
  copy: {
    flex: 1,
    gap: 2,
  },
})
