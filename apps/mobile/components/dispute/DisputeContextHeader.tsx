import { useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { AlertTriangle } from 'lucide-react-native'
import { partyRoleLabel, partyAccent, displayName, formatAssetAmount } from '@tenda/shared'
import type { DisputeThreadContext, DossierParty } from '@tenda/shared'
import { Text } from '@/components/ui/Text'
import { Avatar } from '@/components/ui/Avatar'
import { GigStatusBadge } from '@/components/gig/GigStatusBadge'
import { ExchangeStatusBadge } from '@/components/exchange/ExchangeStatusBadge'
import { spacing } from '@/theme/tokens'

interface Props {
  context: DisputeThreadContext
  /** So the current user's own party row reads "You". */
  currentUserId: string
}

/**
 * Compact, always-visible context card atop the mediation thread: what the
 * escrow was (subject + amount + status), who the two parties are (kind-aware
 * Poster/Worker or Maker/Taker roles, with the raiser flagged), and the
 * dispute reason (expandable). Read-only — reuses the shared party vocabulary
 * and asset formatter so nothing is hardcoded per call site.
 */
export function DisputeContextHeader({ context, currentUserId }: Props) {
  const { theme } = useUnistyles()
  const [expanded, setExpanded] = useState(false)

  const subject = context.subject_title ?? (context.kind === 'gig' ? 'Gig' : 'Currency exchange')

  return (
    <View style={[s.card, { backgroundColor: theme.colors.surface.inset, borderColor: theme.colors.border.subtle }]}>
      <View style={s.headRow}>
        <Text weight="semibold" numberOfLines={1} style={s.subject}>
          {subject}
        </Text>
        {context.kind === 'gig' ? (
          <GigStatusBadge status={context.status} />
        ) : (
          <ExchangeStatusBadge status={context.status} />
        )}
      </View>

      <Text variant="caption" color={theme.colors.content.secondary} style={s.amount}>
        {formatAssetAmount(context.amount_raw, context.asset)}
      </Text>

      <View style={s.parties}>
        {context.parties.map((party) => (
          <PartyChip
            key={party.user_id}
            party={party}
            kind={context.kind}
            isSelf={party.user_id === currentUserId}
          />
        ))}
      </View>

      <Pressable
        onPress={() => setExpanded((v) => !v)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse dispute reason' : 'Expand dispute reason'}
      >
        <Text
          variant="caption"
          color={theme.colors.content.secondary}
          numberOfLines={expanded ? undefined : 2}
          style={s.reason}
        >
          <Text variant="caption" weight="semibold" color={theme.colors.content.tertiary}>
            Reason:{' '}
          </Text>
          {context.reason}
        </Text>
      </Pressable>
    </View>
  )
}

function PartyChip({
  party,
  kind,
  isSelf,
}: {
  party: DossierParty
  kind: DisputeThreadContext['kind']
  isSelf: boolean
}) {
  const { theme } = useUnistyles()
  const name = isSelf ? 'You' : displayName(party.first_name, party.last_name, party.user_id)

  return (
    <View style={s.chip}>
      {/* `tone`, not `gradient`: Avatar only honours `gradient` at lg/xl, so
          the role colour these chips were meant to carry never rendered. */}
      <Avatar size="sm" name={name} tone={partyAccent(party.role)} />
      <View style={s.chipBody}>
        <Text variant="caption" color={theme.colors.content.tertiary}>
          {partyRoleLabel(kind, party.role)}
        </Text>
        <View style={s.chipNameRow}>
          <Text weight="semibold" numberOfLines={1} style={s.chipName}>
            {name}
          </Text>
          {party.raised_dispute && (
            <AlertTriangle size={12} color={theme.colors.feedback.danger.base} />
          )}
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: 6,
  },
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
  amount: { marginTop: -2 },
  parties: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  chipBody: { flex: 1, minWidth: 0 },
  chipNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipName: {
    fontSize: 13.5,
    flexShrink: 1,
  },
  reason: {
    marginTop: 6,
    lineHeight: 18,
  },
})
