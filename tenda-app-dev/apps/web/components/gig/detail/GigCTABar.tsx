'use client'

/**
 * The gig detail's action bar — web twin of mobile's GigCTABar over the
 * SHARED branch rules + arrangement. Two families of branches feed it — the
 * ordinary lifecycle and the approval-mode surface — asked INDEPENDENTLY;
 * `assignSlots` turns the answers into an arrangement: one notice, one
 * primary, up to two secondary.
 */
import {
  PLATFORM_CONFIG_DEFAULTS,
  assignSlots,
  gigCtaBranches,
  isEmptyArrangement,
  type ActiveSheet,
  type CtaBranch,
  type CtaWidth,
  type EscrowTxType,
  type GigDetail,
} from '@tenda/shared'
import { usePlatformConfigStore } from '@/stores/platform-config.store'
import { ApprovalCTA, type ApprovalAction } from './ApprovalCTA'
import { LifecycleCTA } from './LifecycleCTA'
import { secondaryWidth } from './width'

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
  // The submit/reclaim/release windows are all `completion_deadline + grace`;
  // the shared default covers the first render before config lands — it is
  // the same number the server seeds the column with.
  const grace =
    usePlatformConfigStore((s) => s.config?.grace_period_seconds) ??
    PLATFORM_CONFIG_DEFAULTS.grace_period_seconds

  // An in-flight transaction hides every branch: the escrow is mid-move, so
  // any button would offer a transition against a state already changing.
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
    <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-card p-4">
      {txInProgress && (
        <p className="rounded-control bg-feedback-warning-surface px-4 py-3 text-center text-xs font-semibold text-feedback-warning-base">
          Transaction in progress, please wait…
        </p>
      )}
      {arrangement !== null && (
        <div className="flex flex-col gap-2">
          {arrangement.notice !== null && render(arrangement.notice, 'full')}
          {arrangement.primary !== null && render(arrangement.primary, 'full')}
          {arrangement.secondary.length > 0 && (
            <div className="flex gap-2">
              {arrangement.secondary.map((b, i) =>
                render(b, secondaryWidth(i, arrangement.secondary.length)),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
