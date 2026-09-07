'use client'

/**
 * Why there is nothing to sell — said instead of the asset picker (#60).
 * Twin of mobile's sell/SellWalletNotice; the copy for both comes from the
 * shared `sellWalletNotice`, so the two can only diverge in how they are drawn.
 *
 * Before this, web rendered NOTHING when the option list was empty and left a
 * disabled CTA reading "Choose an asset" — an instruction with no asset on
 * screen to follow it. The list is already filtered to chains the reader holds
 * a verified wallet on, so empty is the whole message; it just had four causes
 * and no voice.
 *
 * Its own component rather than the `Notice` primitive because it carries an
 * affordance, and because two of the four states carry DIFFERENT ones: the
 * retries re-run different loads.
 */
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { sellWalletNotice, transactionGateRoute, type WalletSectionState } from '@tenda/shared'

const ACTION_CLASS =
  'mt-3 inline-flex items-center rounded-control border border-feedback-warning-base/50 px-3 py-1.5 text-sm font-semibold text-feedback-warning-base hover:bg-feedback-warning-base/10'

export function SellWalletNotice({
  section,
  noWalletMessage,
  onRetryWallets,
  onRetryChains,
}: {
  section: WalletSectionState
  /** The mode-specific line — cashing out and posting an offer differ. */
  noWalletMessage: string
  onRetryWallets: () => void
  onRetryChains: () => void
}) {
  const notice = sellWalletNotice(section, noWalletMessage)
  if (notice === null) return null

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-card border border-feedback-warning-base/40 bg-feedback-warning-surface px-4 py-3"
    >
      <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-feedback-warning-base" />
      <div className="min-w-0">
        <p className="max-w-[60ch] text-sm text-content-secondary">{notice.message}</p>
        {notice.action === 'link' && (
          <Link href={transactionGateRoute('wallet_required')} className={ACTION_CLASS}>
            {notice.cta}
          </Link>
        )}
        {notice.action === 'retry-wallets' && (
          <button type="button" onClick={onRetryWallets} className={ACTION_CLASS}>
            {notice.cta}
          </button>
        )}
        {notice.action === 'retry-chains' && (
          <button type="button" onClick={onRetryChains} className={ACTION_CLASS}>
            {notice.cta}
          </button>
        )}
      </div>
    </div>
  )
}
