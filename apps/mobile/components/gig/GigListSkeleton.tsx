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

/** Rendered height of each `GigCardCompact` variant (padding + line boxes). */
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
