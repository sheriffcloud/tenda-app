/**
 * Placeholder gig cards for the body of a loading gig list.
 *
 * Replaces the full-screen `LoadingScreen` the feed used to hand
 * `PaginatedList`: that one is `flex: 1` centred, which only worked because
 * the list swapped ITSELF out for it — taking the chip rows with it. A body
 * skeleton needs intrinsic height, and matching each card variant's rendered
 * height keeps the layout still, so real rows land where the placeholders were
 * instead of shunting the list on arrival.
 */
import { View, StyleSheet } from 'react-native'
import { Skeleton } from '@/components/ui'
import { spacing } from '@/theme/tokens'
import type { GigCardVariant } from './GigCardCompact'

/**
 * Rendered height of each `GigCardCompact` variant (padding + line boxes).
 *
 * The COMMON height, not a guarantee: since the chain badge joined the category
 * row that row wraps when the labels are long (a testnet name beside a
 * multi-day deadline), which adds one badge line to the card. No single number
 * covers both, so `rich` and `priceLeading` track the case that renders on most
 * rows.
 *
 * `classic` is NOT maintained against that: no caller selects it (the variant
 * is kept for revertibility, and both lists pass `rich` or `priceLeading`), and
 * its figure predates the chain badge leaving its own line — so it is stale by
 * roughly that line's height. Re-measure it before selecting the variant rather
 * than trusting the number here.
 */
const CARD_HEIGHT: Record<GigCardVariant, number> = {
  rich: 150,
  priceLeading: 112,
  classic: 138,
}

interface GigListSkeletonProps {
  /** Card variant the list renders, so the placeholder matches its height. */
  variant?: GigCardVariant
  count?: number
}

export function GigListSkeleton({ variant = 'rich', count = 4 }: GigListSkeletonProps) {
  return (
    <View style={s.wrap} testID="gig-list-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width="100%" height={CARD_HEIGHT[variant]} radius={16} />
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: spacing.sm },
})
