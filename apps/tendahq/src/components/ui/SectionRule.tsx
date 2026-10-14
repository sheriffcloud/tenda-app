import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface RuleProps {
  /** What the section is, in the eyebrow face. */
  title: string
  /** A right-aligned aside — the section's one-line fact. Hidden on phones. */
  aside?: string
  className?: string
}

/**
 * The rule every section opens on: title, aside, one hairline — the title
 * and aside in the eyebrow face. No numbering: a number is a fact about
 * position that every content file would have to restate by hand.
 */
export function SectionRule({ title, aside, className }: RuleProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3.5 border-b border-[var(--border-default)] pb-5',
        className,
      )}
    >
      <span className="eyebrow text-[var(--content-tertiary)]">{title}</span>
      {aside !== undefined && (
        <span className="eyebrow ml-auto hidden text-[var(--content-tertiary)] sm:inline">
          {aside}
        </span>
      )}
    </div>
  )
}

interface HeadProps {
  /** The headline — children so a `<Period />` can end it. */
  children: ReactNode
  /** The lede, set beside the headline on wide screens. */
  lede: ReactNode
  className?: string
}

/**
 * Headline left, lede right, bottoms aligned — the shape the Paper Landing
 * gives every section head, so the right half of the column is never left
 * empty under a one-column heading.
 */
export function SectionHead({ children, lede, className }: HeadProps) {
  return (
    <div
      className={cn(
        'grid gap-5 pt-7 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-end md:gap-[clamp(20px,4vw,56px)] md:pt-[clamp(28px,3.6vw,44px)]',
        className,
      )}
    >
      <h2 className="h1 text-[var(--content-primary)]">{children}</h2>
      <p className="body-lg max-w-[58ch] text-[var(--content-secondary)]">{lede}</p>
    </div>
  )
}

/**
 * The blue period. The wordmark is 97% ink and one brand-blue point, and the
 * page keeps that ratio: every headline ends on the mark's own move, and blue
 * appears in running type nowhere else.
 */
export function Period() {
  return <span className="text-[var(--brand-primary)]">.</span>
}
