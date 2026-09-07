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
import { takedownCopy, type TakedownAudience, type TakedownSubject } from './copy'

/**
 * The parts of a detail wire this reads. Structural, so `GigDetail` and
 * `ExchangeDetail` both satisfy it without either importing the other — the
 * same shape-not-name approach as shared's `EscrowDetailLike`.
 *
 * Taken as ONE object rather than four id props on purpose: `viewerId`,
 * `creatorId`, `counterpartyId` and `assignedCounterpartyId` are all `string`,
 * so a caller that swapped two of them would compile cleanly and quietly show
 * the wrong audience the wrong message. Passing the escrow removes that failure
 * mode instead of testing for it at every call site.
 */
export interface TakedownEscrow {
  /** `escrows.hidden` off the detail wire. */
  hidden: boolean
  creator: { id: string }
  counterparty: { id: string } | null
  /** Pending direct invite; a party for disclosure, so they see this too. */
  assigned_counterparty_id: string | null
}

interface Props {
  escrow: TakedownEscrow
  subject: TakedownSubject
  viewerId: string
}

export function takedownAudience(escrow: TakedownEscrow, viewerId: string): TakedownAudience {
  if (viewerId === escrow.creator.id) return 'owner'
  if (viewerId === escrow.counterparty?.id) return 'counterparty'
  if (viewerId === escrow.assigned_counterparty_id) return 'counterparty'
  return 'moderator'
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
