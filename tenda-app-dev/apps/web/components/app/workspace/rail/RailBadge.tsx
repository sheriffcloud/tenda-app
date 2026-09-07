import { unreadBadgeLabel } from '@tenda/shared'
import { cn } from '@/lib/cn'

/**
 * Unread pip on a rail item.
 *
 * Two placements, one pill: absolute in the icon slot's corner while the rail
 * is collapsed (the 40px slot has no row to sit in), and IN the row —
 * centred on the text line, after the label — when it is expanded. The
 * absolute corner float over an expanded row was the misalignment the 2026-08
 * redesign was asked to fix.
 *
 * The cap and the zero-suppression are a product-wide display rule, so they
 * come from shared `unreadBadgeLabel` rather than a fourth local copy of
 * `count > 9 ? '9+' : count`.
 *
 * Fill is --feedback-danger-SOLID, not the comp's --feedback-danger-base:
 * base is tuned for text/borders and lightens to #F0706E on dark, where white
 * on it measures 2.90 (fails AA). The solid variant exists for exactly this
 * and holds 4.99 light / 4.64 dark. Text is --brand-on-primary, the token
 * that is #FFFFFF in BOTH themes — --content-inverse flips to near-black on
 * dark and would put dark text on a red pip.
 */
export function RailBadge({ count, inline = false }: { count: number; inline?: boolean }) {
  const label = unreadBadgeLabel(count)
  // Nothing to draw below 1 — a "0" pip reads as an alert that is not there.
  if (label === null) return null
  return (
    <span
      aria-hidden
      className={cn(
        'animate-fadein flex h-4 min-w-4 items-center justify-center rounded-full bg-feedback-danger-solid px-0.5 font-numeric text-[10px] font-bold leading-none text-brand-on-primary',
        inline ? 'shrink-0 px-1' : 'absolute right-1 top-1',
      )}
    >
      {label}
    </span>
  )
}
