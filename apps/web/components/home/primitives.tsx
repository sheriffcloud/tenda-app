/**
 * The dashboard's three repeated shapes (#60 preview): a hairline CARD with
 * an eyebrow head, a status PILL in the head, and the ruled ROW LINK the
 * my-gigs, trades and messages cards are lists of. One geometry each, so the
 * cards line up — same edges, same head, same rule between rows.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/lib/cn'

export function DashCard({
  title,
  pill,
  more,
  children,
  className,
}: {
  title: string
  /** The head's status pill — "2 in flight", "3 unread". */
  pill?: ReactNode
  /** The head's trailing link. */
  more?: { href: string; label: string }
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={cn('rounded-card border border-border-subtle bg-surface-card px-[22px] pb-[18px] pt-5', className)}
    >
      <div className="flex items-center gap-3">
        <Eyebrow as="h2" tone="secondary">
          {title}
        </Eyebrow>
        {pill}
        {more !== undefined && (
          <Link
            href={more.href}
            className="ml-auto inline-flex items-center gap-1 whitespace-nowrap type-body-small font-semibold text-content-secondary hover:text-content-primary"
          >
            {more.label}
            <ArrowRight size={13} aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export type DashPillDot = 'live' | 'brand' | 'quiet'

const DOT: Record<DashPillDot, string> = {
  live: 'bg-feedback-success-base',
  brand: 'bg-brand-primary',
  quiet: 'bg-content-tertiary',
}

export function DashPill({ dot, children }: { dot?: DashPillDot; children: ReactNode }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-[7px] whitespace-nowrap rounded-full border border-border-default px-[11px] type-eyebrow uppercase text-content-tertiary">
      {dot !== undefined && <span aria-hidden className={cn('size-1.5 rounded-full', DOT[dot])} />}
      {children}
    </span>
  )
}

/** The ruled list the row links sit in — one rule above, one between. */
export function DashRows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mt-2.5 border-t border-border-default', className)}>{children}</div>
}

export function DashRow({
  href,
  title,
  subtitle,
  badge,
  trailing,
  lead,
  muted = false,
}: {
  href: string
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  /** Right-aligned mono figure or time. */
  trailing?: ReactNode
  /** An avatar before the text. */
  lead?: ReactNode
  /** A settled row reads quieter. */
  muted?: boolean
}) {
  return (
    <Link
      href={href}
      className="group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3.5 border-b border-border-subtle py-[11px] last:border-b-0"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {lead}
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span
            className={cn(
              'truncate text-sm font-semibold leading-5 group-hover:text-content-primary',
              muted ? 'text-content-secondary' : 'text-content-primary',
            )}
          >
            {title}
          </span>
          {/* A STRING subtitle is free text somebody else wrote — a chat
              message, a notice body — and keeps to one line; a node subtitle
              (place · chain badge) wraps so a pill is never cut in half. */}
          {typeof subtitle === 'string' ? (
            <span className="min-w-0 truncate text-xs leading-4 text-content-tertiary">{subtitle}</span>
          ) : subtitle !== undefined ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-content-tertiary">
              {subtitle}
            </span>
          ) : null}
        </span>
      </span>
      {badge ?? <span />}
      {trailing !== undefined ? (
        <span className={cn('whitespace-nowrap font-numeric text-xs leading-4', muted ? 'text-content-tertiary' : 'text-content-primary')}>
          {trailing}
        </span>
      ) : (
        <span />
      )}
    </Link>
  )
}

/** A short line under a card head when a list has nothing in it. */
export function DashEmpty({ children }: { children: ReactNode }) {
  return <p className="mt-3 type-body-small text-content-tertiary">{children}</p>
}
