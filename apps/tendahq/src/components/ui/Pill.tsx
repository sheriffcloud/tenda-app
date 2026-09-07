import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type PillTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'live'
export type PillSize = 'sm' | 'md'

interface Props {
  children: ReactNode
  tone?: PillTone
  size?: PillSize
  dot?: boolean
  /** Add a soft tone-tinted ring around the leading dot (live/locked emphasis). */
  dotRing?: boolean
  className?: string
}

const SURFACE: Record<PillTone, string> = {
  neutral: 'bg-[var(--surface-inset)] text-[var(--content-secondary)] border-[var(--border-subtle)]',
  brand:   'bg-[var(--brand-surface)] text-[var(--brand)] border-[var(--brand-border)]',
  accent:  'bg-[var(--accent-surface)] text-[var(--accent)] border-[var(--accent-border)]',
  success: 'bg-[var(--success-surface)] text-[var(--success)] border-transparent',
  warning: 'bg-[var(--warning-surface)] text-[var(--warning)] border-transparent',
  danger:  'bg-[var(--danger-surface)] text-[var(--danger)] border-transparent',
  live:    'bg-[var(--brand-surface)] text-[var(--live-bright)] border-transparent',
}

const DOT: Record<PillTone, string> = {
  neutral: 'bg-[var(--content-tertiary)]',
  brand:   'bg-[var(--brand)]',
  accent:  'bg-[var(--accent)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger:  'bg-[var(--danger)]',
  live:    'bg-[var(--live-bright)]',
}

const DOT_RING: Record<PillTone, string> = {
  neutral: 'shadow-[0_0_0_3px_color-mix(in_oklab,var(--content-tertiary)_24%,transparent)]',
  brand:   'shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_24%,transparent)]',
  accent:  'shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_24%,transparent)]',
  success: 'shadow-[0_0_0_3px_color-mix(in_oklab,var(--success)_28%,transparent)]',
  warning: 'shadow-[0_0_0_3px_color-mix(in_oklab,var(--warning)_24%,transparent)]',
  danger:  'shadow-[0_0_0_3px_color-mix(in_oklab,var(--danger)_24%,transparent)]',
  live:    'shadow-[0_0_0_3px_color-mix(in_oklab,var(--live-bright)_28%,transparent)]',
}

const SIZES: Record<PillSize, string> = {
  sm: 'h-[22px] px-2.5 text-[10.5px] tracking-[0.105em] gap-1.5',
  md: 'h-7 px-3 text-[11px] tracking-[0.12em] gap-2',
}

export function Pill({
  children,
  tone = 'neutral',
  size = 'sm',
  dot = false,
  dotRing = false,
  className,
}: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full border font-semibold uppercase whitespace-nowrap',
        SURFACE[tone],
        SIZES[size],
        className,
      )}
    >
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', DOT[tone], dotRing && DOT_RING[tone])} />
      )}
      {children}
    </span>
  )
}
