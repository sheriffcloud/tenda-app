import { LANDING_CHAINS, MORE_CHAINS_LABEL } from '@/content'
import { cn } from '@/lib/cn'

interface Props {
  /** Append the "more coming" badge. */
  withMore?: boolean
  className?: string
}

/**
 * The supported-chain badge row (manifest-derived): one dot-tinted pill per
 * mainnet chain, optionally followed by a "more coming" badge. Used in the
 * hero and the final CTA.
 */
export function ChainBadges({ withMore = true, className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {LANDING_CHAINS.map((chain) => (
        <span
          key={chain.id}
          className="mono-sm inline-flex h-8 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 font-semibold text-[var(--content-secondary)]"
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: chain.color,
              boxShadow: `0 0 0 3px color-mix(in oklab, ${chain.color} 22%, transparent)`,
            }}
          />
          {chain.name}
        </span>
      ))}
      {withMore && (
        <span className="mono-sm inline-flex h-8 items-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] px-3.5 text-[var(--content-tertiary)]">
          {MORE_CHAINS_LABEL}
        </span>
      )}
    </div>
  )
}
