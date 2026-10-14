/**
 * THE chain badge (#60, correction c): a hairline pill carrying the chain's
 * own brand colour as a solid glyph disc beside the manifest's display name,
 * in the mono face. The same component everywhere a chain is named — a card,
 * a row subtitle, the detail terms, a wallet row, the feed's filter rail — so
 * "which network holds the money" reads identically across the app.
 *
 * Every fact comes from shared `chainDisplay`: the label the whole app already
 * prints through `chainLabel`, the family glyph and hex from the display table
 * tendahq draws from too, and which of the two fixed inks reads on that hex.
 * The disc is an inline style ON PURPOSE — the colour is DATA keyed by chain
 * family, not a design token, and a chain added to shared must colour itself
 * here with no class-name edit. A chain with no display row draws the brand
 * blue: a neutral fallback rather than a colour this file invented.
 */
import { chainDisplay } from '@tenda/shared'
import { cn } from '@/lib/cn'

export type ChainBadgeSize = 'md' | 'sm'

const PILL: Record<ChainBadgeSize, string> = {
  md: 'h-6 gap-[7px] pl-1.5 pr-2.5',
  sm: 'h-5 gap-1.5 pl-1 pr-2',
}

/** A glyph-only pill is square-ish: the disc with the same inset each side. */
const GLYPH_ONLY: Record<ChainBadgeSize, string> = {
  md: 'h-6 px-1.5',
  sm: 'h-5 px-1',
}

export const CHAIN_BADGE_FALLBACK_COLOR = 'var(--brand-primary)'

export function ChainBadge({
  chainId,
  size = 'md',
  glyphOnly = false,
  className,
}: {
  chainId: string
  size?: ChainBadgeSize
  /** The disc alone — for a facts line that names the chain elsewhere. */
  glyphOnly?: boolean
  className?: string
}) {
  const chain = chainDisplay(chainId)
  return (
    <span
      data-chain-badge={chainId}
      // A glyph-only disc still has to SAY which chain it is.
      role={glyphOnly ? 'img' : undefined}
      aria-label={glyphOnly ? chain.label : undefined}
      title={glyphOnly ? chain.label : undefined}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-border-default bg-surface-card font-numeric text-[11px] font-semibold leading-none tracking-[0.3px] text-content-primary',
        glyphOnly ? GLYPH_ONLY[size] : PILL[size],
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-3.5 shrink-0 place-items-center rounded-full text-[8px] leading-none not-italic"
        style={{ background: chain.color ?? CHAIN_BADGE_FALLBACK_COLOR, color: chain.inkColor }}
      >
        {chain.glyph}
      </span>
      {!glyphOnly && chain.label}
    </span>
  )
}
