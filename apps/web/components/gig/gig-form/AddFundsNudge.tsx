'use client'

/**
 * Advisory early warning that no linked wallet can cover the budget, shown
 * while the form is still being filled — web twin of mobile's
 * gig-form/AddFundsNudge. Funding happens at publish, where
 * `ensureSufficientBalance` is the actual stop. Reads through the SAME
 * `readSpendableBalance` as that check, so the hint and the block always
 * agree. Silent unless the balance is KNOWN and short: an unread balance is
 * unknown, not zero, so an RPC failure never accuses the user of being
 * underfunded.
 */
import Link from 'next/link'
import { toBigIntOrNull } from '@tenda/shared'
import { useSpendableBalance } from '@/hooks/wallet/useSpendableBalance'

export function AddFundsNudge({
  chainId,
  asset,
  paymentRaw,
}: {
  chainId: string
  asset: string
  /** Base-unit string; '' until a budget is set. */
  paymentRaw: string
}) {
  const { balance } = useSpendableBalance(chainId, asset)

  // BigInt-exact: base units exceed Number.MAX_SAFE_INTEGER on 18-decimal
  // assets. Parsed through the shared helper so an unparseable budget reads
  // as "no answer" rather than throwing over an advisory hint.
  const required = toBigIntOrNull(paymentRaw)
  const available = balance === null ? null : toBigIntOrNull(balance.amountRaw)
  if (required === null || available === null || required <= available) return null

  return (
    <Link
      href="/wallet"
      className="block rounded-control border border-brand-primary-border bg-brand-primary-surface px-3.5 py-2.5 text-xs text-brand-primary"
    >
      Your balance won&apos;t cover this amount, add funds. Your draft stays right here.
    </Link>
  )
}
