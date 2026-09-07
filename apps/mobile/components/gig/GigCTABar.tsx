/**
 * The gig detail's bottom action bar.
 *
 * Two families of branches feed it — the ordinary lifecycle, and the
 * approval-mode surface (apply / assign / release) — and they are asked
 * INDEPENDENTLY. They used to be mutually exclusive, approval first, which is
 * how an assigned worker saw "I'm not available" and no Submit Proof, and how
 * an approval-mode poster ended up with no way to cancel their own gig.
 *
 * What each answer displaces is now a property of the branch (its slot), not
 * of the order the questions happen to be asked in. `assignSlots` turns the
 * list into an arrangement: one notice, one primary, up to two secondary.
 */
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { PLATFORM_CONFIG_DEFAULTS, type EscrowTxType, type GigDetail } from '@tenda/shared'
import { spacing, radius } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { usePlatformConfigStore } from '@/stores/platform-config.store'
import {
  ApprovalCTA,
  LifecycleCTA,
  assignSlots,
  gigCtaBranches,
  isEmptyArrangement,
  type ActiveSheet,
  type ApprovalAction,
  type CtaBranch,
  type CtaWidth,
} from './gig-cta'

export type { ActiveSheet, ApprovalAction }

interface GigCTABarProps {
  gig: GigDetail
  userId: string
  /** True while an unsigned tx is being requested/signed. */
  isTxBuilding: boolean
  /** True while a broadcast tx awaits confirmation. */
  txInProgress: boolean
  onAction: (action: ActiveSheet) => void
  /** Wallet-opening transition → screen shows the shared confirm gate first. */
  onTxAction: (action: EscrowTxType) => void
  /** Approval-mode actions; the screen decides which of them reach a wallet. */
  onApprovalAction: (action: ApprovalAction) => void
  /** CO6 "retry from draft": prefill the create form from this draft. */
  onRetryDraft: () => void
}

/**
 * A lone secondary fills its row; a pair keeps the weighting the bar has always
 * had — the constructive action takes the space, the danger one is only as wide
 * as its label. Module scope: it closes over nothing.
 */
function secondaryWidth(index: number, count: number): CtaWidth {
  return count === 1 ? 'full' : index === 0 ? 'grow' : 'auto'
}

export function GigCTABar({
  gig,
  userId,
  isTxBuilding,
  txInProgress,
  onAction,
  onTxAction,
  onApprovalAction,
  onRetryDraft,
}: GigCTABarProps) {
  const { theme } = useUnistyles()
  // The submit/reclaim/release windows are all `completion_deadline + grace`,
  // and the grace is on the wire precisely so the client stops guessing at it.
  // The shared default covers the first render before config lands; it is the
  // same number the server seeds the column with.
  const grace =
    usePlatformConfigStore((s) => s.config?.grace_period_seconds) ??
    PLATFORM_CONFIG_DEFAULTS.grace_period_seconds

  // An in-flight transaction hides every branch: the escrow is mid-move, so
  // any button would be offering a transition against a state that is already
  // changing. Deliberately a guard rather than a branch — it is transient UI
  // state, not something the escrow says about itself.
  const arrangement = txInProgress ? null : assignSlots(gigCtaBranches(gig, userId, grace))
  if (arrangement !== null && isEmptyArrangement(arrangement)) return null

  const render = (branch: CtaBranch, width: CtaWidth) =>
    branch.family === 'approval' ? (
      <ApprovalCTA
        key={branch.id}
        branch={branch.id}
        gig={gig}
        busy={isTxBuilding}
        width={width}
        onAction={onApprovalAction}
      />
    ) : (
      <LifecycleCTA
        key={branch.id}
        branch={branch.id}
        isTxBuilding={isTxBuilding}
        width={width}
        onAction={onAction}
        onTxAction={onTxAction}
        onRetryDraft={onRetryDraft}
      />
    )

  return (
    <View
      style={[
        s.bottomBar,
        { backgroundColor: theme.colors.surface.background, borderTopColor: theme.colors.border.subtle },
      ]}
    >
      {txInProgress && (
        <View style={[s.infoNotice, { backgroundColor: theme.colors.feedback.warning.surface }]}>
          <Text variant="caption" color={theme.colors.feedback.warning.base} weight="semibold" align="center">
            Transaction in progress, please wait…
          </Text>
        </View>
      )}
      {arrangement !== null && (
        <View style={s.stack}>
          {arrangement.notice !== null && render(arrangement.notice, 'full')}
          {arrangement.primary !== null && render(arrangement.primary, 'full')}
          {arrangement.secondary.length > 0 && (
            <View style={s.row}>
              {arrangement.secondary.map((b, i) =>
                render(b, secondaryWidth(i, arrangement.secondary.length)),
              )}
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
  },
  stack: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  infoNotice: {
    padding: spacing.md,
    borderRadius: radius.md,
  },
})
