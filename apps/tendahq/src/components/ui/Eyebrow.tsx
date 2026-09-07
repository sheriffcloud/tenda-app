import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type EyebrowTone = 'default' | 'brand' | 'accent' | 'live'

interface Props {
  children: ReactNode
  tone?: EyebrowTone
  /** Show a leading 6px tone-coloured dot. */
  dot?: boolean
  className?: string
}

const TONE_COLOR: Record<EyebrowTone, string> = {
  default: 'text-[var(--content-tertiary)]',
  brand:   'text-[var(--brand)]',
  accent:  'text-[var(--accent)]',
  live:    'text-[var(--live-bright)]',
}

const DOT_BG: Record<EyebrowTone, string> = {
  default: 'bg-[var(--content-tertiary)]',
  brand:   'bg-[var(--brand)]',
  accent:  'bg-[var(--accent)]',
  live:    'bg-[var(--live-bright)]',
}

export function Eyebrow({ children, tone = 'default', dot = false, className }: Props) {
  return (
    <div className={cn('eyebrow inline-flex items-center gap-2', TONE_COLOR[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_BG[tone])} />}
      <span>{children}</span>
    </div>
  )
}
