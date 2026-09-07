import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'

function Stat({ value, label, unit, hasDivider }: { value: string; label: string; unit?: string; hasDivider?: boolean }) {
  const { theme } = useUnistyles()
  return (
    <View style={s.stat}>
      {hasDivider && <View style={[s.statDivider, { backgroundColor: theme.colors.border.subtle }]} />}
      <Text style={[s.statValue, { color: theme.colors.content.primary }]}>
        {value}
        {unit && <Text style={[s.statUnit, { color: theme.colors.content.tertiary }]}>{unit}</Text>}
      </Text>
      <Text style={[s.statLabel, { color: theme.colors.content.tertiary }]}>{label.toUpperCase()}</Text>
    </View>
  )
}

/** Completed / posted / reputation summary row beneath the profile hero. */
export function ProfileStats({
  completed,
  posted,
  reputation,
}: {
  completed: number
  posted: number
  reputation: string
}) {
  const { theme } = useUnistyles()
  return (
    <View style={[s.stats, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
      <Stat value={String(completed)} label="Completed" />
      <Stat value={String(posted)} label="Posted" hasDivider />
      <Stat value={reputation} unit="/5" label="Reputation" hasDivider />
    </View>
  )
}

const s = StyleSheet.create({
  stats: {
    marginHorizontal: 20,
    marginTop: 22,
    height: 80,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
  },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  statDivider: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 1 },
  statValue: {
    fontFamily: typography.fonts.mono,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 22,
  },
  statUnit: { fontFamily: typography.fonts.mono, fontSize: 11, fontWeight: '600', letterSpacing: 0 },
  statLabel: { fontFamily: typography.fonts.mono, fontSize: 9.5, fontWeight: '600', letterSpacing: 0.95 },
})
