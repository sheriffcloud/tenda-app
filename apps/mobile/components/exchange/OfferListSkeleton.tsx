import { View, StyleSheet } from 'react-native'
import { spacing } from '@/theme/tokens'
import { Skeleton } from '@/components/ui'

/** Placeholder rows shown while an exchange offer list is loading. */
export function OfferListSkeleton() {
  return (
    <View style={s.wrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={s.card}>
          <Skeleton width="100%" height={110} radius={12} />
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md },
  card: { marginBottom: spacing.sm },
})
