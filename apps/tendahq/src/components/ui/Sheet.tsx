import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The quiet card at the sheet radius — §03's product sheet, §05's rail panel,
 * §06's chain panel: one hairline, the card ground, the card shadow, clipped
 * so ruled children meet its edge. Three sections drew it by hand with the
 * same string; a section that needs it as a tab panel passes the role and
 * ids through.
 */
export function Sheet({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        'overflow-hidden rounded-[var(--radius-sheet)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]',
        className,
      )}
    />
  )
}

interface HeadProps {
  /** What the sheet is — the rail's name, the chain's name — as its heading. */
  label: ReactNode
  /** The chip at the right: the sheet's honest status. */
  children: ReactNode
}

/** A sheet's ruled head: the eyebrow heading at the left, the chip at the right. */
export function SheetHead({ label, children }: HeadProps) {
  return (
    <header className="flex flex-wrap items-center gap-[11px] border-b border-[var(--border-default)] px-[26px] py-[18px]">
      <h3 className="eyebrow text-[var(--content-secondary)]">{label}</h3>
      <span className="ml-auto">{children}</span>
    </header>
  )
}
