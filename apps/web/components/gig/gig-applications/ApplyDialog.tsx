'use client'

/**
 * The apply dialog — web port of mobile's ApplySheet: the optional pitch,
 * the obligation the applicant is taking on, and the WALLET they will work
 * under. The wallet picker is not polish either: an assignment BAKES the
 * chosen address into the on-chain escrow, and before the picker existed the
 * assign silently took the primary — a wallet the worker may not control at
 * that moment and never chose. Only wallets on the GIG's chain namespace are
 * offered (an EVM gig cannot pay a Solana wallet), and with none linked the
 * dialog says so and routes to link-wallet instead of letting an
 * unassignable application through. All copy is SHARED.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  APPLICATION_MESSAGE_MAX_LENGTH,
  APPLY_MESSAGE_LABEL,
  APPLY_MESSAGE_PLACEHOLDER,
  APPLY_OBLIGATION,
  APPLY_SUBMIT_LABEL,
  APPLY_TITLE,
  APPLY_WALLET_HINT,
  APPLY_WALLET_LABEL,
  APPLY_WALLET_LINK_CTA,
  APPLY_WALLET_LOAD_FAILED,
  APPLY_WALLET_LOADING,
  APPLY_WALLET_REQUIRED,
  APPLY_WALLET_RETRY,
  chainLabel,
  findChain,
  preferredWalletAddress,
  transactionGateRoute,
  truncateWallet,
  verifiedWalletsOn,
} from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { controlClassName } from '@/components/ui/TextField'
import { Modal } from '@/components/ui/overlay/Modal'
import { useAuthStore } from '@/stores/auth.store'

export function ApplyDialog({
  open,
  busy,
  chainId,
  initialWallet = null,
  onClose,
  onSubmit,
}: {
  open: boolean
  busy: boolean
  /** The gig's chain — the picker offers ONLY wallets on its namespace. */
  chainId: string
  /** A previous application's recorded wallet (re-apply preselects it). */
  initialWallet?: string | null
  onClose: () => void
  /** Resolves true once the application is stored; the dialog closes on true. */
  onSubmit: (message: string | null, walletAddress: string) => Promise<boolean>
}) {
  const [message, setMessage] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const wallets = useAuthStore((s) => s.wallets)
  const walletsStatus = useAuthStore((s) => s.walletsStatus)
  const ensureWallets = useAuthStore((s) => s.ensureWallets)

  // The trust list loads once per session; opening the dialog is the moment
  // it becomes load-bearing (an empty list here must mean "none linked",
  // never "not loaded yet" — walletsStatus separates the two).
  useEffect(() => {
    if (open) void ensureWallets()
  }, [open, ensureWallets])

  const ns = findChain(chainId)?.namespace ?? null
  const options = ns === null ? [] : verifiedWalletsOn(ns, wallets)
  const selected =
    picked !== null && options.some((w) => w.address === picked)
      ? picked
      : ns === null
        ? null
        : preferredWalletAddress(ns, initialWallet, wallets)

  async function handleSubmit() {
    if (selected === null) return
    // Trimmed to null here as well as server-side: an all-whitespace pitch
    // and no pitch mean the same thing.
    const trimmed = message.trim()
    if (await onSubmit(trimmed === '' ? null : trimmed, selected)) {
      setMessage('')
      setPicked(null)
      onClose()
    }
  }

  return (
    <Modal open={open} title={APPLY_TITLE} onClose={onClose}>
      <p className="rounded-control bg-feedback-warning-surface px-3 py-2 text-xs text-feedback-warning-base">
        {APPLY_OBLIGATION}
      </p>

      {walletsStatus === 'error' ? (
        // The list FAILED — an empty picker with a wordless disabled submit
        // would read as "none linked" and dead-end the applicant.
        <div className="flex flex-col gap-2 rounded-control bg-feedback-danger-surface px-3 py-2">
          <p className="text-xs text-feedback-danger-text">{APPLY_WALLET_LOAD_FAILED}</p>
          <button
            type="button"
            onClick={() => void ensureWallets()}
            className="self-start text-xs font-semibold text-brand-primary underline-offset-2 hover:underline"
          >
            {APPLY_WALLET_RETRY}
          </button>
        </div>
      ) : walletsStatus !== 'ready' ? (
        <p className="text-xs text-content-tertiary">{APPLY_WALLET_LOADING}</p>
      ) : options.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-control bg-feedback-danger-surface px-3 py-2">
          <p className="text-xs text-feedback-danger-text">{APPLY_WALLET_REQUIRED(chainLabel(chainId))}</p>
          <Link
            href={transactionGateRoute('wallet_required')}
            className="text-xs font-semibold text-brand-primary underline-offset-2 hover:underline"
          >
            {APPLY_WALLET_LINK_CTA}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-control-input-label">{APPLY_WALLET_LABEL}</p>
          <div role="radiogroup" aria-label={APPLY_WALLET_LABEL} className="flex flex-col gap-1.5">
            {options.map((wallet) => (
              <button
                key={wallet.address}
                type="button"
                role="radio"
                aria-checked={wallet.address === selected}
                onClick={() => setPicked(wallet.address)}
                className={`flex items-center justify-between rounded-control border px-3 py-2 text-left text-sm ${
                  wallet.address === selected
                    ? 'border-brand-primary bg-brand-primary-surface text-content-primary'
                    : 'border-border-default bg-surface-card text-content-secondary'
                }`}
              >
                <span className="font-numeric">{truncateWallet(wallet.address)}</span>
                {/* "Main", per chain family (#42). No chain name: every wallet
                    in this picker is the gig's own chain. */}
                {wallet.is_primary && (
                  <span className="text-xs text-content-tertiary">Main</span>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-content-tertiary">{APPLY_WALLET_HINT}</p>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm font-semibold text-control-input-label">
        {APPLY_MESSAGE_LABEL}
        <textarea
          className={`${controlClassName} min-h-24 resize-y`}
          placeholder={APPLY_MESSAGE_PLACEHOLDER}
          value={message}
          maxLength={APPLICATION_MESSAGE_MAX_LENGTH}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={busy || selected === null}
        onClick={handleSubmit}
      >
        {busy ? 'Working…' : APPLY_SUBMIT_LABEL}
      </Button>
    </Modal>
  )
}
