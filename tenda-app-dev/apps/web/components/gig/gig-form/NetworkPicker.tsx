'use client'

/**
 * Network (chain) selector, CO5 — web twin of mobile's
 * gig-form/NetworkPicker. Gigs are USDC-denominated on every chain, so this
 * only picks where the escrow lives. Renders null when there's a single
 * eligible chain (no choice to make).
 */
import { chainOptionLabel } from '@tenda/shared'
import { Chip } from '@/components/ui/Chip'
import type { ChainOption } from '@/hooks/gig/useGigForm'

export function NetworkPicker({
  options,
  selected,
  onSelect,
  assetSymbol,
}: {
  options: ChainOption[]
  selected: string
  onSelect: (id: string) => void
  assetSymbol: string
}) {
  if (options.length <= 1) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-content-primary">Network</p>
      <p className="-mt-1 text-xs text-content-tertiary">
        Where the escrow lives. Workers are paid in {assetSymbol} on this network.
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Chip
            key={opt.id}
            label={chainOptionLabel(opt)}
            selected={selected === opt.id}
            disabled={!opt.enabled}
            onClick={() => onSelect(opt.id)}
          />
        ))}
      </div>
    </div>
  )
}
