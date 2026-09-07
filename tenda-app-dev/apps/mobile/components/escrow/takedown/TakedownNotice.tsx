/**
 * The banner a taken-down escrow shows at the top of its detail screen.
 *
 * Renders NOTHING when the escrow is visible, so both detail bodies mount it
 * unconditionally and neither carries a `hidden &&` of its own.
 *
 * The audience is worked out from ids the wire already carries — creator,
 * counterparty, assignee — and never from a role. The detail routes read no
 * role either (their JWT claim can be a token lifetime stale, see
 * server lib/escrow-detail-scope.ts), so "not a party" is exactly the reader
 * those routes let through on a role check: a moderator.
 */
import { View, StyleSheet } from 'react-native'
import { ExpandableNotice } from '@/components/ui/information'
import { spacing } from '@/theme/tokens'
import { takedownAudience, takedownCopy, type TakedownEscrow, type TakedownSubject } from '@tenda/shared'

export type { TakedownEscrow }

interface Props {
  escrow: TakedownEscrow
  subject: TakedownSubject
  viewerId: string
}

export function TakedownNotice({ escrow, subject, viewerId }: Props) {
  if (!escrow.hidden) return null

  const { title, detail } = takedownCopy(takedownAudience(escrow, viewerId), subject)

  return (
    <View style={s.wrap}>
      <ExpandableNotice
        content={{ summary: title, title, description: detail, tone: 'warning' }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
})
