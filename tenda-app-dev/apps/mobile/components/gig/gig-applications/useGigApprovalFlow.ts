/**
 * The gig detail's approval-mode plumbing: which sheet or dialog an approval
 * action opens, and what confirming it does.
 *
 * Extracted so the screen stays a view. It also puts the one distinction that
 * matters in a single place — `unassign` is the ONLY approval action that
 * opens a wallet, so it goes back to the screen's transaction gate, while
 * apply/withdraw/release are off-chain and confirm through the styled
 * ConfirmDialog instead (never TxConfirmDialog, which promises a wallet, and
 * never Alert.alert, per convention).
 */

import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useApplications } from './useApplications'
import { RELEASE_CONFIRM, WITHDRAW_CONFIRM } from '@tenda/shared'
// From the DECLARING module, not the `@/components/gig` barrel: that barrel
// re-exports GigCTABar, which imports gig-cta, which imports this folder's
// copy. Type-only so nothing is emitted either way, but pointing at the source
// keeps the dependency legible instead of routing it through a cycle.
import type { ApprovalAction } from '@/components/gig/gig-cta/ApprovalCTA'

/** The two off-chain actions that ask before acting. */
type OffchainAction = 'withdraw' | 'release'

interface UseGigApprovalFlowArgs {
  escrowId: string
  /** Refetch the detail — its `viewer` block decides the next CTA. */
  onChanged: () => void
  /** Raise the wallet-opening transition through the screen's confirm gate. */
  onRequestUnassign: () => void
}

export function useGigApprovalFlow({
  escrowId,
  onChanged,
  onRequestUnassign,
}: UseGigApprovalFlowArgs) {
  const router = useRouter()
  const [applyOpen, setApplyOpen] = useState(false)
  const [pending, setPending] = useState<OffchainAction | null>(null)
  const actions = useApplications({ onChanged })

  function handleAction(action: ApprovalAction) {
    switch (action) {
      case 'apply':
        return setApplyOpen(true)
      case 'withdraw':
        return setPending('withdraw')
      case 'release':
        return setPending('release')
      case 'viewApplicants':
        return router.push(`/gig/${escrowId}/applicants` as Parameters<typeof router.push>[0])
      case 'unassign':
        return onRequestUnassign()
    }
  }

  async function confirmPending() {
    const action = pending
    setPending(null)
    if (action === 'withdraw') await actions.withdraw(escrowId)
    if (action === 'release') await actions.release(escrowId)
  }

  return {
    busy: actions.busy,
    applyOpen,
    closeApply: () => setApplyOpen(false),
    apply: (message: string | null, walletAddress: string) =>
      actions.apply(escrowId, message, walletAddress),
    handleAction,
    /** Spread onto the shared ConfirmDialog. */
    confirmDialog: {
      ...(pending === 'release' ? RELEASE_CONFIRM : WITHDRAW_CONFIRM),
      visible: pending !== null,
      loading: actions.busy,
      onConfirm: () => void confirmPending(),
      onCancel: () => setPending(null),
    },
  }
}
