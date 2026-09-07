import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Star, CheckCircle2, CalendarDays, ShieldAlert } from 'lucide-react-native'
import type { UserStandingResponse } from '@tenda/shared'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Text } from '@/components/ui/Text'

interface StandingDetailSheetProps {
  visible: boolean
  onClose: () => void
  standing: UserStandingResponse
  displayName: string
}

function formatMemberSince(iso: string | null): string | null {
  if (iso === null) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
}

/** Breakdown behind the StandingBadge (stage-7 § UX placements). */
export function StandingDetailSheet({ visible, onClose, standing, displayName }: StandingDetailSheetProps) {
  const { theme } = useUnistyles()
  const memberSince = formatMemberSince(standing.member_since)
  const score = standing.review_score !== null ? Number(standing.review_score) : null

  const rows = [
    {
      Icon: Star,
      label: 'Review score',
      value: score !== null && !Number.isNaN(score) ? `★ ${score.toFixed(1)}` : 'No reviews yet',
    },
    {
      Icon: CheckCircle2,
      label: 'Completion rate',
      value:
        standing.completion_rate !== null
          ? `${Math.round(standing.completion_rate * 100)}% · ${standing.completed_count} completed`
          : 'New user, not enough history yet',
    },
    ...(memberSince !== null
      ? [{ Icon: CalendarDays, label: 'Member since', value: memberSince }]
      : []),
  ]

  return (
    <BottomSheet visible={visible} onClose={onClose} title={displayName}>
      {rows.map(({ Icon, label, value }) => (
        <View key={label} style={[s.row, { borderTopColor: theme.colors.border.subtle }]}>
          <View style={[s.icon, { backgroundColor: theme.colors.surface.inset }]}>
            <Icon size={16} color={theme.colors.content.primary} />
          </View>
          <View style={s.body}>
            <Text size={12} color={theme.colors.content.tertiary}>{label}</Text>
            <Text size={14.5} weight="semibold">{value}</Text>
          </View>
        </View>
      ))}

      {standing.is_limited && (
        <View style={[s.limited, { backgroundColor: theme.colors.feedback.warning.surface }]}>
          <ShieldAlert size={16} color={theme.colors.feedback.warning.base} />
          <Text size={12.5} color={theme.colors.feedback.warning.base} style={s.limitedText}>
            This account is currently limited.
          </Text>
        </View>
      )}
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  limited: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  limitedText: { flex: 1, lineHeight: 17 },
})
