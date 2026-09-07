'use client'

/**
 * Posting needs a linked wallet — said at the top of the composer (#59).
 * Twin of mobile's gig-form/ComposerWalletNotice: same props, same states,
 * and the copy for both comes from the shared `composerWalletNotice`, so the
 * two can only diverge in how they are drawn.
 *
 * The server has always known this and enforced it, but it only spoke at
 * `Review and sign`: a 403 after the whole form was filled, answered by a
 * redirect to Settings that took the form with it. The facts were on screen
 * from the first step — `gigChainOptions` had already worked out that no chain
 * was signable — and nothing asked them the question.
 *
 * It does NOT block composing. Someone may want to write the gig now and link
 * a wallet before they sign, and a form that refuses to be filled would be a
 * second wall rather than a fix. The way out is offered, never taken: an
 * automatic redirect is what lost the form in the first place.
 *
 * Its own component rather than the `Notice` primitive because it carries an
 * affordance — the same reason `AlertPanel` takes its action as a slot and
 * mobile's `DraftsBanner` was kept out of `NoticeBanner`.
 */
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { composerWalletNotice, transactionGateRoute, type ComposerWalletGate } from '@tenda/shared'

const ACTION_CLASS =
  'mt-3 inline-flex items-center rounded-control border border-feedback-warning-base/50 px-3 py-1.5 text-sm font-semibold text-feedback-warning-base hover:bg-feedback-warning-base/10'

export function ComposerWalletNotice({
  gate,
  onRetry,
}: {
  gate: ComposerWalletGate
  /** Re-run the wallets[] load — only reachable from the `unavailable` state. */
  onRetry: () => void
}) {
  // Null for 'ok' (nothing to say) and for 'unknown' — which has not EARNED
  // anything to say: the wallet list or the chain registry is still settling,
  // and a notice there would accuse a reader who may well have a wallet.
  const notice = composerWalletNotice(gate)
  if (notice === null) return null

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-card border border-feedback-warning-base/40 bg-feedback-warning-surface px-4 py-3"
    >
      <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-feedback-warning-base" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-feedback-warning-base">{notice.title}</p>
        <p className="mt-1 max-w-[60ch] text-sm text-content-secondary">{notice.body}</p>
        {notice.action === 'retry' ? (
          <button type="button" onClick={onRetry} className={ACTION_CLASS}>
            {notice.cta}
          </button>
        ) : (
          <Link href={transactionGateRoute('wallet_required')} className={ACTION_CLASS}>
            {notice.cta}
          </Link>
        )}
      </div>
    </div>
  )
}
