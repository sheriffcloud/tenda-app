'use client'

/**
 * Platform-fee breakdown card for the create review step — web port of
 * mobile's components/shared/FeeSummary. The creator locks exactly the
 * principal; the platform fee is deducted from the COUNTERPARTY's payout on
 * settlement (contract `approve`: payout = amount − fee) — so this shows:
 * locked principal / platform fee / counterparty net, never principal + fee.
 */
import { formatAssetAmount } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { useEscrowFee } from '@/hooks/escrow/useEscrowFee'

type FeeVariant = 'gig' | 'exchange'

interface VariantCopy {
  escrowLabel: string
  netLabel: string
  note: (feePct: string) => string
}

const VARIANT_COPY: Record<FeeVariant, VariantCopy> = {
  gig: {
    escrowLabel: 'You escrow',
    netLabel: 'Worker receives',
    note: (pct) => `You escrow the full budget. The ${pct}% fee is taken from the worker's payout on completion.`,
  },
  exchange: {
    escrowLabel: 'You lock',
    netLabel: 'Buyer receives',
    note: (pct) => `You lock the full amount. The ${pct}% platform fee is taken from the buyer's crypto when the trade completes.`,
  },
}

export function FeeSummary({
  asset,
  principalRaw,
  variant = 'gig',
  isSeeker,
}: {
  /** Asset registry id, drives decimals + symbol (CO5). */
  asset: string
  /** Principal in raw base units (string — BigInt-exact for 18-dp assets). */
  principalRaw: string
  variant?: FeeVariant
  /**
   * Fee tier of the escrow. Creation flows omit it (the creator's own Seeker
   * status is what gets baked in); read surfaces MUST pass the escrow's
   * snapshot so the projection matches what the contract will charge.
   */
  isSeeker?: boolean
}) {
  const viewerIsSeeker = useAuthStore((s) => s.user?.is_seeker ?? false)
  const { feeRaw, netRaw, feePct: feePctOrNull } = useEscrowFee(isSeeker ?? viewerIsSeeker, principalRaw)
  const feePct = feePctOrNull ?? '—'
  const copy = VARIANT_COPY[variant]

  return (
    <div className="rounded-card border border-border-default bg-surface-card px-4 py-3">
      <p className="mb-2 type-caption font-semibold uppercase text-content-tertiary">
        Payment breakdown
      </p>
      <div className="flex items-baseline justify-between py-1.5">
        <span className="text-sm text-content-secondary">{copy.escrowLabel}</span>
        <span className="font-mono text-sm font-semibold text-content-primary">
          {formatAssetAmount(principalRaw, asset)}
        </span>
      </div>
      <div className="flex items-baseline justify-between py-1.5">
        <span className="text-sm text-content-secondary">{`Platform fee (${feePct}%)`}</span>
        <span className="font-mono text-sm font-semibold text-content-secondary">
          {feeRaw != null ? `− ${formatAssetAmount(feeRaw.toString(), asset)}` : '—'}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between border-t border-border-subtle pt-2.5">
        <span className="text-sm font-semibold text-content-primary">{copy.netLabel}</span>
        <span className="type-mono font-bold text-content-primary">
          {netRaw != null ? formatAssetAmount(netRaw.toString(), asset) : '—'}
        </span>
      </div>
      <p className="mt-2.5 text-xs text-content-tertiary">{copy.note(feePct)}</p>
    </div>
  )
}
