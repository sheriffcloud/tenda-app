import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { LoadStatus } from '@tenda/shared'
import { typography } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'

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

/**
 * Completed / posted / reputation summary row beneath the profile hero.
 *
 * The two COUNTS are gated on `status`: this row used to render `String(0)`
 * unconditionally, so a load still in flight — and a load that had failed —
 * both stated that the account had completed nothing and posted nothing. An
 * em-dash says the honest thing, and 'error' adds the retry, because a number
 * nobody can refresh is a dead end.
 *
 * REPUTATION is deliberately NOT gated: it comes off the user row, not off
 * these counts, so a failed count read is no reason to blank it.
 */
export function ProfileStats({
  completed,
  posted,
  reputation,
  status,
  onRetry,
}: {
  completed: number
  posted: number
  reputation: string
  status: LoadStatus
  onRetry: () => void
}) {
  const { theme } = useUnistyles()
  const tone = theme.colors.feedback.danger
  const count = (value: number) => (status === 'ready' ? String(value) : '—')
  return (
    <>
      <View style={[s.stats, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
        <Stat value={count(completed)} label="Completed" />
        <Stat value={count(posted)} label="Posted" hasDivider />
        <Stat value={reputation} unit="/5" label="Reputation" hasDivider />
      </View>
      {status === 'error' && (
        <View style={[s.error, { backgroundColor: tone.surface, borderColor: tone.border }]}>
          <Text size={13} color={tone.text} style={s.errorText}>
            We couldn’t load your activity.
          </Text>
          <Button variant="outline" size="sm" onPress={onRetry}>
            Retry
          </Button>
        </View>
      )}
    </>
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
    fontFamily: typography.fonts.mono.bold,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 22,
  },
  statUnit: { fontFamily: typography.fonts.mono.semibold, fontSize: 11, fontWeight: '600', letterSpacing: 0 },
  statLabel: { fontFamily: typography.fonts.mono.semibold, fontSize: 9.5, fontWeight: '600', letterSpacing: 0.95 },
  error: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    gap: 10,
  },
  errorText: { lineHeight: 18 },
})
