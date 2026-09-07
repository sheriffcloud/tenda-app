import { useState } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
import { useNotificationPermission } from '@/hooks/useNotificationPermission'
import {
  shouldPrimeAtSignup,
  shouldPrimeAfterCommitment,
  type NotificationPromptState,
} from '@/lib/notifications/policy'
import { NotificationPrimer } from './NotificationPrimer'
import type { PrimerReason } from './primerCopy'

/**
 * Single mount point for the permission primer, covering the post-signup ask
 * (tier 1) and the just-in-time re-ask after a first commitment (tier 2).
 *
 * Mounted once at the root so the sheet follows the user across the tab and
 * modal stacks, rather than every screen owning a copy of the policy.
 *
 * Fields are selected individually on purpose: an object selector would build a
 * fresh snapshot each render, which zustand v5 compares with Object.is and so
 * would re-render forever.
 */
export function NotificationPrimerHost() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const profileComplete = useAuthStore((s) => s.profileComplete)

  const hydrated = useNotificationPromptStore((s) => s.hydrated)
  const softDeclinedAt = useNotificationPromptStore((s) => s.softDeclinedAt)
  const reminderCount = useNotificationPromptStore((s) => s.reminderCount)
  const lastRemindedAt = useNotificationPromptStore((s) => s.lastRemindedAt)
  const hasPrimedAtSignup = useNotificationPromptStore((s) => s.hasPrimedAtSignup)
  const commitmentCount = useNotificationPromptStore((s) => s.commitmentCount)
  const markPrimed = useNotificationPromptStore((s) => s.markPrimed)
  const markSoftDecline = useNotificationPromptStore((s) => s.markSoftDecline)

  const { permission, ask } = useNotificationPermission()
  const [closedReason, setClosedReason] = useState<PrimerReason | null>(null)

  const promptState: NotificationPromptState = {
    softDeclinedAt,
    reminderCount,
    lastRemindedAt,
    hasPrimedAtSignup,
    commitmentCount,
  }

  // Never interrupt an unauthenticated or half-built account, and never ask a
  // user who already receives notifications.
  const eligible =
    isAuthenticated && profileComplete === true && hydrated && permission !== null && !permission.enabled

  let reason: PrimerReason | null = null
  if (eligible && permission !== null) {
    if (shouldPrimeAtSignup(promptState, permission.canAskAgain)) reason = 'signup'
    else if (shouldPrimeAfterCommitment(promptState, permission.canAskAgain)) reason = 'commitment'
  }

  if (permission === null || reason === null || reason === closedReason) return null
  const activeReason = reason

  /** A decline is still an answer, so the signup primer is spent either way. */
  async function settle(granted: boolean) {
    setClosedReason(activeReason)
    if (!hasPrimedAtSignup) await markPrimed()
    if (!granted) await markSoftDecline()
  }

  async function handleConfirm(): Promise<boolean> {
    const granted = await ask()
    await settle(granted)
    return granted
  }

  async function handleDismiss() {
    await settle(false)
  }

  return (
    <NotificationPrimer
      visible
      reason={activeReason}
      canAskAgain={permission.canAskAgain}
      onConfirm={handleConfirm}
      onDismiss={handleDismiss}
    />
  )
}
