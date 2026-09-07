import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'
import { formatAmountOrUnknown } from '@tenda/shared'

/** Two lifetime stat cards (USDC earned / spent) under the wallet hero. */
/** null = no metadata for the summary's asset, so no figure can be shown. */
export function EarningsSummary({
  earnedUsdc,
  spentUsdc,
}: {
  earnedUsdc: number | null
  spentUsdc: number | null
}) {
  const { theme } = useUnistyles()
  return (
    <View style={s.earnings}>
      <View style={[s.statCard, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
        <View style={s.statLabelRow}>
          <View style={[s.statDot, { backgroundColor: theme.colors.numeric.positive }]} />
          <Text style={[s.statLabel, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
            EARNED
          </Text>
        </View>
        <Text style={[s.statValue, { color: theme.colors.numeric.positive }]}>+ {formatAmountOrUnknown(earnedUsdc, (v) => v.toFixed(2))}</Text>
        <Text style={[s.statUnit, { color: theme.colors.content.tertiary }]}>USDC · lifetime</Text>
      </View>
      <View style={[s.statCard, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
        <View style={s.statLabelRow}>
          <View style={[s.statDot, { backgroundColor: theme.colors.numeric.negative }]} />
          <Text style={[s.statLabel, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
            SPENT
          </Text>
        </View>
        <Text style={[s.statValue, { color: theme.colors.numeric.negative }]}>− {formatAmountOrUnknown(spentUsdc, (v) => v.toFixed(2))}</Text>
        <Text style={[s.statUnit, { color: theme.colors.content.tertiary }]}>USDC · lifetime</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  earnings: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  statCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statLabel: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    flexShrink: 1,
    includeFontPadding: false,
  },
  statValue: {
    fontFamily: typography.fonts.mono.bold,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: 6,
  },
  statUnit: { fontFamily: typography.fonts.mono.regular, fontSize: 10, lineHeight: 13, marginTop: 2 },
})
