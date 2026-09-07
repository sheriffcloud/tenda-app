/**
 * Everything above the gig rows on the home feed — the nudge banner, the
 * featured rail, the "Feed" title row with its filter affordance, and the
 * category + settlement-chain chip rows. Extracted from home.tsx so the
 * screen stays a shell and the header can be exercised on its own.
 */
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ListFilter } from 'lucide-react-native'
import { Text, Chip } from '@/components/ui'
import { ServerStatus } from '@/components/feedback'
import { FeaturedRail } from '@/components/gig/FeaturedRail'
import { NotificationNudgeBanner } from '@/components/notifications'
import { ChainFilterChips } from '@/components/filters'
import { CATEGORY_META } from '@/lib/categories'
import { spacing } from '@/theme/tokens'
import type { GigCategory } from '@tenda/shared'

interface FeedHeaderProps {
  railRefreshKey: number
  hasFilters: boolean
  category: GigCategory | null
  chainId: string | null
  onOpenFilter: () => void
  onCategoryChange: (category: GigCategory | null) => void
  onChainChange: (chain_id: string | null) => void
}

export function FeedHeader({
  railRefreshKey,
  hasFilters,
  category,
  chainId,
  onOpenFilter,
  onCategoryChange,
  onChainChange,
}: FeedHeaderProps) {
  const { theme } = useUnistyles()

  return (
    <>
      {/* Cancels the list gutter so the strip runs edge to edge. */}
      <NotificationNudgeBanner style={s.bannerBleed} />
      <FeaturedRail refreshKey={railRefreshKey} />

      <View style={s.feedRow}>
        <Text style={[s.feedTitle, { color: theme.colors.content.primary }]}>Feed</Text>
        <ServerStatus />
        <Pressable
          onPress={onOpenFilter}
          style={({ pressed }) => [
            s.filterBtn,
            { backgroundColor: theme.colors.surface.inset },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Filter gigs"
          accessibilityRole="button"
        >
          <ListFilter size={16} color={theme.colors.content.secondary} />
          {hasFilters && (
            <View style={[s.filterDot, { backgroundColor: theme.colors.brand.primary }]} />
          )}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        <Chip
          label="All"
          selected={category === null}
          onPress={() => onCategoryChange(null)}
        />
        {CATEGORY_META.map((cat) => (
          <Chip
            key={cat.key}
            label={cat.label}
            selected={category === cat.key}
            category={cat.key}
            // Single-select like the chain row: "All" clears, a re-tap on the
            // active chip does nothing.
            onPress={() => onCategoryChange(cat.key)}
          />
        ))}
      </ScrollView>

      {/* Renders nothing on a single-chain deployment. */}
      <ChainFilterChips value={chainId} onChange={onChainChange} />
    </>
  )
}

const s = StyleSheet.create({
  bannerBleed: {
    marginHorizontal: -spacing.lg,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  feedTitle: {
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.44,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 16,
  },
})
