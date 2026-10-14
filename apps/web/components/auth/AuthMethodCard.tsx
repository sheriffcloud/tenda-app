/**
 * One way in on the method chooser (Auth comp, lines 460-472): an icon tile, a
 * label, a line saying what choosing it actually does, and a chevron.
 *
 * The HINT is the part that earns the card over a plain button. Email and
 * wallet are not interchangeable here — email creates accounts, a wallet only
 * signs an existing one in (decision #3, server-enforced) — and a chooser that
 * hides that difference sends people who have never used the product down the
 * one path that cannot finish.
 */
import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export function AuthMethodCard({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string
  icon: LucideIcon
  label: string
  hint: string
}) {
  return (
    <Link
      href={href}
      className="flex min-h-14 min-w-0 items-center gap-3.5 rounded-card border border-border-default bg-surface-card p-4 shadow-card transition-shadow hover:border-border-strong hover:shadow-elevated"
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-inset text-content-secondary"
      >
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display type-title text-content-primary">
          {label}
        </span>
        <span className="block type-body-small text-content-secondary">{hint}</span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-content-tertiary" />
    </Link>
  )
}
