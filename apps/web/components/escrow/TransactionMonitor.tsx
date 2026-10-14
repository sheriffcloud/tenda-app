'use client'

/**
 * Phase-driven transaction progress modal — port of mobile's
 * components/feedback/TransactionMonitor with the web-specific additions the
 * stage-4 plan names: `navigator.onLine` instead of NetInfo, and a
 * `beforeunload` warning while a signature is in flight (signing /
 * broadcasting) — once broadcast, closing the tab is SAFE by design (the
 * server's chain listener converges without the client), so the warning
 * lifts the moment the tx is out.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { CheckCircle, XCircle, Wallet } from 'lucide-react'
import {
  TRANSACTION_COPY,
  TRANSACTION_RESILIENCE,
  abortPendingWalletRequest,
  hasPendingWalletRequest,
  subscribePendingWalletRequest,
  type TransactionProgressPhase,
} from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ModalBackdrop } from '@/components/ui/overlay/ModalBackdrop'
import { useOnlineStatus } from '@/hooks/connectivity/useOnlineStatus'
import { useSlowOperation } from '@/hooks/timing/useSlowOperation'
import {
  ESCROW_CONFIRM_DISMISS_MS,
  useEscrowTransactionSync,
} from '@/hooks/escrow/sync/useEscrowTransactionSync'

export type TxPhase = TransactionProgressPhase

interface TransactionMonitorProps {
  signature: string | null
  onConfirmed: () => void
  onFailed: (msg: string) => void
  /**
   * Subscribe to `escrow:<id>` for the server-applied confirmation frame
   * (stage-5 seam; RPC polling remains the independent fallback).
   */
  escrowId?: string
  /** CAIP-2 chain of the tx — selects the RPC fallback (solana vs EVM receipt). */
  chainId?: string
  /**
   * Lifecycle before the signature exists (build → wallet signature). The
   * modal opens as soon as the phase leaves 'idle', so the user gets
   * "Approve in your wallet" guidance while the popup is up.
   */
  phase?: TxPhase
  /** Present-tense verb for the confirming heading, e.g. "Releasing payment". */
  actionLabel?: string
  /** Overrides the caption under "Preparing transaction…" (gig moderation wait). */
  preparingCaption?: string
  /** Authoritative API projection check after an RPC receipt confirms. */
  checkApplied: () => Promise<boolean>
}

/** Visual state = internal poll result once broadcast, else the pre-sign phase. */
type Display = 'preparing' | 'signing' | 'broadcasting' | 'confirming' | 'confirmed' | 'deferred' | 'failed'

export function TransactionMonitor({
  signature,
  onConfirmed,
  onFailed,
  escrowId,
  chainId,
  phase,
  actionLabel,
  preparingCaption,
  checkApplied,
}: TransactionMonitorProps) {
  const online = useOnlineStatus()
  const broadcasting = phase === 'broadcasting'
  const slowBroadcast = useSlowOperation(broadcasting, TRANSACTION_RESILIENCE.slowOperationNoticeMs)
  const confirmation = useEscrowTransactionSync({ signature, escrowId, chainId, checkApplied })
  // Latest-callback ref, synced in an effect (the render-time assignment
  // mobile uses trips web's stricter ref lint; the timer fires long after
  // commit, so effect timing is equivalent here).
  const confirmedRef = useRef(onConfirmed)
  useEffect(() => {
    confirmedRef.current = onConfirmed
  })
  // True only while a guarded wallet request is awaiting the wallet — the one
  // moment a Cancel can actually abort something.
  const canCancelSigning = useSyncExternalStore(
    subscribePendingWalletRequest,
    hasPendingWalletRequest,
    () => false,
  )

  useEffect(() => {
    if (confirmation.state !== 'applied') return
    const timer = setTimeout(() => confirmedRef.current(), ESCROW_CONFIRM_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [confirmation.state])

  // Web addition: leaving mid-signature can lose the wallet's answer (the
  // guard would time out into a wedged session). Broadcast onward is safe —
  // the server converges without this tab — so the warning covers ONLY the
  // signing/broadcasting window.
  const signatureInFlight = phase === 'signing' || phase === 'broadcasting'
  useEffect(() => {
    if (!signatureInFlight) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [signatureInFlight])

  function handleDismiss() {
    onFailed(confirmation.failure !== '' ? confirmation.failure : 'Transaction failed')
  }

  // The confirming spinner covers everything from broadcast onward; the phase
  // (when supplied) drives the pre-signature messaging.
  const phaseActive = phase !== undefined && phase !== 'idle'
  const open = phaseActive || (signature !== null && signature !== '')
  if (!open) return null

  const display: Display =
    confirmation.state === 'applied'
      ? 'confirmed'
      : confirmation.state === 'deferred'
        ? 'deferred'
        : confirmation.state === 'failed'
          ? 'failed'
          : phase === 'preparing'
            ? 'preparing'
            : phase === 'signing'
              ? 'signing'
              : phase === 'broadcasting'
                ? 'broadcasting'
                : 'confirming'

  const confirmingTitle = actionLabel !== undefined && actionLabel !== ''
    ? `${actionLabel}…`
    : TRANSACTION_COPY.confirmingTitle

  return (
    <ModalBackdrop
      role="alertdialog"
      label="Transaction progress"
      strongDim
      cardClassName="max-w-sm gap-4 items-center text-center"
    >
        {display === 'preparing' && (
          <>
            <Spinner />
            <h2 className="font-display text-lg font-bold text-content-primary">{TRANSACTION_COPY.preparingTitle}</h2>
            <p className="text-sm text-content-secondary">{preparingCaption ?? TRANSACTION_COPY.preparingCaption}</p>
          </>
        )}

        {display === 'signing' && (
          <>
            <Wallet size={48} className="text-brand-primary" />
            <h2 className="font-display text-lg font-bold text-content-primary">{TRANSACTION_COPY.signingTitle}</h2>
            <p className="text-sm text-content-secondary">{TRANSACTION_COPY.signingCaption}</p>
            {canCancelSigning && (
              <Button variant="outline" size="md" onClick={abortPendingWalletRequest}>
                Cancel
              </Button>
            )}
          </>
        )}

        {display === 'broadcasting' && (
          <>
            <Spinner />
            <h2 className="font-display text-lg font-bold text-content-primary">{TRANSACTION_COPY.broadcastingTitle}</h2>
            <p className="text-sm text-content-secondary">
              {!online
                ? TRANSACTION_COPY.offlineBroadcastCaption
                : slowBroadcast
                  ? TRANSACTION_COPY.slowBroadcastCaption
                  : TRANSACTION_COPY.broadcastingCaption}
            </p>
          </>
        )}

        {display === 'confirming' && (
          <>
            <Spinner />
            <h2 className="font-display text-lg font-bold text-content-primary">
              {confirmation.state === 'syncing' ? TRANSACTION_COPY.syncingTitle : confirmingTitle}
            </h2>
            <p className="text-sm text-content-secondary">
              {confirmation.state === 'syncing'
                ? TRANSACTION_COPY.syncingCaption
                : TRANSACTION_COPY.confirmingCaption}
            </p>
          </>
        )}

        {display === 'confirmed' && (
          <>
            <CheckCircle size={56} className="text-feedback-success-base" />
            <h2 className="font-display text-lg font-bold text-content-primary">Transaction confirmed!</h2>
          </>
        )}

        {display === 'failed' && (
          <>
            <XCircle size={56} className="text-feedback-danger-base" />
            <h2 className="font-display text-lg font-bold text-content-primary">Transaction issue</h2>
            <p className="text-sm text-content-secondary">{confirmation.failure}</p>
            <Button variant="outline" size="md" onClick={handleDismiss}>
              Dismiss
            </Button>
          </>
        )}

        {display === 'deferred' && (
          <>
            <Spinner />
            <h2 className="font-display text-lg font-bold text-content-primary">{TRANSACTION_COPY.deferredTitle}</h2>
            <p className="text-sm text-content-secondary">{confirmation.failure}</p>
            <Button variant="outline" size="md" onClick={handleDismiss}>
              Continue
            </Button>
          </>
        )}
    </ModalBackdrop>
  )
}
