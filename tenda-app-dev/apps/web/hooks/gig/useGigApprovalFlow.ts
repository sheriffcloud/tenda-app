'use client'

/**
 * The gig detail's approval-mode plumbing — web twin of mobile's gig-applications/
 * useGigApprovalFlow: which dialog an approval action opens, and what
 * confirming it does. `unassign` is the ONLY approval action that opens a
 * wallet, so it goes back to the screen's transaction gate; apply/withdraw/
 * release are off-chain and confirm through the styled ConfirmDialog.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RELEASE_CONFIRM, WITHDRAW_CONFIRM } from '@tenda/shared'
import { useApplications } from './useApplications'
import type { ApprovalAction } from '@/components/gig/detail/ApprovalCTA'

/** The two off-chain actions that ask before acting. */
type OffchainAction = 'withdraw' | 'release'

interface UseGigApprovalFlowArgs {
  escrowId: string
  /** Refetch the detail — its `viewer` block decides the next CTA. */
  onChanged: () => void
  /** Raise the wallet-opening transition through the screen's confirm gate. */
  onRequestUnassign: () => void
}

export function useGigApprovalFlow({ escrowId, onChanged, onRequestUnassign }: UseGigApprovalFlowArgs) {
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
        return router.push(`/my-gigs/${escrowId}/applicants`)
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
      open: pending !== null,
      busy: actions.busy,
      onConfirm: () => void confirmPending(),
      onCancel: () => setPending(null),
    },
  }
}
