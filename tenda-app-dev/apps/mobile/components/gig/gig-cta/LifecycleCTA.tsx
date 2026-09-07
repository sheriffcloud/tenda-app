/**
 * Draws ONE lifecycle branch. Which branches apply is decided by the pure
 * `lifecycleBranches`; where they sit is decided by `assignSlots`. This file
 * knows neither.
 *
 * One branch is one control, deliberately. The composites this replaced each
 * carried their own "+ Dispute" — five hand-kept copies of the same button,
 * which is how the sixth state that needed it (a worker past the approval
 * deadline) silently went without.
 */
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { EscrowTxType } from '@tenda/shared'
import { spacing, radius } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'
import type { ActiveSheet, CtaWidth, LifecycleBranch } from '@tenda/shared'
import { widthProps } from './slots'

interface Props {
  branch: LifecycleBranch
  isTxBuilding: boolean
  /** Decided by the arrangement — see CtaWidth. */
  width: CtaWidth
  onAction: (action: ActiveSheet) => void
  onTxAction: (action: EscrowTxType) => void
  onRetryDraft: () => void
}

export function LifecycleCTA({
  branch,
  isTxBuilding,
  width,
  onAction,
  onTxAction,
  onRetryDraft,
}: Props) {
  const { theme } = useUnistyles()
  const shared = widthProps(width)

  switch (branch) {
    case 'retryDraft':
      return <Button {...shared} variant="primary" onPress={onRetryDraft}>Edit &amp; repost</Button>

    case 'deleteDraft':
      return <Button {...shared} variant="outline" onPress={() => onAction('delete')}>Delete Draft</Button>

    case 'refundExpired':
      return (
        <Button {...shared} variant="primary" loading={isTxBuilding} onPress={() => onTxAction('refund_expired')}>
          Claim Refund
        </Button>
      )

    case 'accept':
      return <Button {...shared} variant="primary" onPress={() => onTxAction('accept')}>Accept Gig</Button>

    case 'decline':
      return <Button {...shared} variant="outline" onPress={() => onTxAction('decline')}>Decline</Button>

    case 'cancel':
      return <Button {...shared} variant="danger" onPress={() => onTxAction('cancel')}>Cancel Gig</Button>

    case 'submit':
      return <Button {...shared} variant="primary" onPress={() => onAction('proof')}>Submit Proof</Button>

    case 'approve':
      return (
        <Button {...shared} variant="primary" loading={isTxBuilding} onPress={() => onTxAction('approve')}>
          Approve &amp; Pay
        </Button>
      )

    case 'claimStalled':
      return (
        <Button {...shared} variant="primary" loading={isTxBuilding} onPress={() => onTxAction('claim_stalled')}>
          Claim Payment
        </Button>
      )

    case 'addProof':
      return <Button {...shared} variant="outline" onPress={() => onAction('addProof')}>Add More Proof</Button>

    case 'addEvidence':
      return <Button {...shared} variant="outline" onPress={() => onAction('addProof')}>Add Evidence</Button>

    case 'reclaim':
      return (
        <Button {...shared} variant="primary" loading={isTxBuilding} onPress={() => onTxAction('reclaim_abandoned')}>
          Reclaim Escrow
        </Button>
      )

    case 'dispute':
      // Opening the explanation sheet is not itself destructive. Keep this
      // entry action restrained; the final "Raise Dispute" confirmation is
      // where the danger treatment belongs.
      return <Button {...shared} variant="outline" onPress={() => onAction('dispute')}>Dispute</Button>

    case 'review':
      return <Button {...shared} variant="outline" onPress={() => onAction('review')}>Leave Review</Button>

    case 'disputedNotice':
      return (
        <View style={[s.notice, { backgroundColor: theme.colors.feedback.warning.surface }]}>
          <Text variant="caption" color={theme.colors.feedback.warning.base} weight="semibold" align="center">
            Under review by admin
          </Text>
        </View>
      )
  }
}

const s = StyleSheet.create({
  notice: { padding: spacing.md, borderRadius: radius.md },
})
