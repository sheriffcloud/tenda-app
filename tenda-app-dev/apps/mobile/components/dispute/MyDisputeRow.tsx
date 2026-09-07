import { Pressable, View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ChevronRight } from 'lucide-react-native'
import { winnerLabel, formatRelativeShort } from '@tenda/shared'
import type { MyDisputeRow as MyDisputeRowData } from '@tenda/shared'
import { Text } from '@/components/ui/Text'
import { GigStatusBadge } from '@/components/gig/GigStatusBadge'
import { ExchangeStatusBadge } from '@/components/exchange/ExchangeStatusBadge'
import { spacing } from '@/theme/tokens'

interface Props {
  row: MyDisputeRowData
  onPress: () => void
}

/**
 * One row in the "My Disputes" list. Presentational — the parent supplies
 * `onPress` (deep-link into the thread). Reuses the kind-aware status badge and
 * the shared winner label so nothing is hardcoded per call site.
 */
export function MyDisputeRow({ row, onPress }: Props) {
  const { theme } = useUnistyles()

  const subject = row.subject_title ?? (row.kind === 'gig' ? 'Gig' : 'Currency exchange')
  const withWhom = row.counterparty_name ?? 'the other party'
  const raisedHint = row.raised_by_me ? 'You raised this' : 'Raised against you'
  const isResolved = row.resolved_at !== null

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open dispute: ${subject}`}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: theme.colors.surface.inset, borderColor: theme.colors.border.subtle },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={s.body}>
        <View style={s.headRow}>
          <Text weight="semibold" numberOfLines={1} style={s.subject}>
            {subject}
          </Text>
          {row.kind === 'gig' ? (
            <GigStatusBadge status={row.status} />
          ) : (
            <ExchangeStatusBadge status={row.status} />
          )}
        </View>

        <Text variant="caption" color={theme.colors.content.secondary} numberOfLines={1} style={s.meta}>
          {withWhom} · {raisedHint}
        </Text>

        <View style={s.footRow}>
          <Text variant="caption" color={theme.colors.content.tertiary}>
            {row.raised_at !== null ? formatRelativeShort(row.raised_at) : ''}
          </Text>
          {isResolved && row.winner !== null && (
            <Text variant="caption" weight="semibold" color={theme.colors.content.secondary}>
              Outcome: {winnerLabel(row.kind, row.winner)}
            </Text>
          )}
        </View>
      </View>

      <ChevronRight size={18} color={theme.colors.content.tertiary} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  body: { flex: 1, minWidth: 0, gap: 4 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subject: {
    flex: 1,
    fontSize: 15,
    letterSpacing: -0.15,
  },
  meta: {},
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
})
