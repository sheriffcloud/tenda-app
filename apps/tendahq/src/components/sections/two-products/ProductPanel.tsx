import type { ReactNode } from 'react'
import { ArrowRight, ArrowLeftRight, Briefcase } from 'lucide-react'
import type { ProductPanel as ProductPanelData } from './content'
import { cn } from '@/lib/cn'

interface Props {
  panel: ProductPanelData
  /** Mini visual slot — gigs list or offer summary. */
  children: ReactNode
}

const ICONS = {
  Briefcase,
  ArrowLeftRight,
} as const

const ACCENT_VAR: Record<ProductPanelData['accent'], { color: string; soft: string; line: string; glow: string }> = {
  brand: {
    color: 'var(--brand)',
    soft: 'var(--brand-surface)',
    line: 'color-mix(in oklab, var(--brand) 70%, transparent)',
    glow: 'color-mix(in oklab, var(--brand) 25%, transparent)',
  },
  accent: {
    color: 'var(--accent)',
    soft: 'var(--accent-surface)',
    line: 'color-mix(in oklab, var(--accent) 70%, transparent)',
    glow: 'color-mix(in oklab, var(--accent) 22%, transparent)',
  },
}

export function ProductPanel({ panel, children }: Props) {
  const Icon = ICONS[panel.icon]
  const accent = ACCENT_VAR[panel.accent]

  return (
    <article
      className={cn(
        'relative flex flex-col gap-7 overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--surface-card-elevated)] p-7 md:p-9',
        'shadow-[var(--shadow-card)]',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent.line}, transparent)` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-40 w-40 blur-3xl"
        style={{ background: accent.glow }}
      />

      <header className="relative flex items-center gap-4">
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border"
          style={{ background: accent.soft, borderColor: 'transparent', color: accent.color }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: accent.color }}>
            {panel.eyebrow}
          </p>
          <p className="mono mt-1 text-[var(--content-secondary)]">{panel.name}</p>
        </div>
      </header>

      <div className="relative flex flex-col gap-4">
        <h3 className="h2 text-[var(--content-primary)]">
          {panel.headline.lead}{' '}
          <span style={{ color: accent.color }}>{panel.headline.emphasis}</span>
        </h3>
        <p className="body-lg text-[var(--content-secondary)]">{panel.body}</p>
      </div>

      <div className="relative flex flex-col gap-2">{children}</div>

      <footer className="relative flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-5">
        <a
          href={panel.link.href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors hover:opacity-80"
          style={{ color: accent.color }}
        >
          {panel.link.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
        <p className="mono-sm ml-auto hidden text-[var(--content-tertiary)] md:block">
          {panel.statsLabel} ·{' '}
          <span className="font-semibold text-[var(--content-secondary)]">{panel.statsValue}</span>
        </p>
      </footer>
    </article>
  )
}
