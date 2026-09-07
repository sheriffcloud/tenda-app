'use client'

/**
 * The list/grid segmented control (#60) — the same control on the public
 * landing and on /gigs, over the same remembered preference. `aria-pressed`
 * toggle buttons, as the preview draws them: the choice is a state, not a
 * destination.
 */
import { LayoutGrid, List } from 'lucide-react'
import { useGigsView, type GigsView } from '@/lib/gigs/browse-view'
import { cn } from '@/lib/cn'
import { OPEN_GIGS_COPY } from './copy'

const VIEWS: readonly { key: GigsView; label: string; icon: typeof List }[] = [
  { key: 'list', label: OPEN_GIGS_COPY.view.list, icon: List },
  { key: 'grid', label: OPEN_GIGS_COPY.view.grid, icon: LayoutGrid },
]

export function GigsViewToggle({
  compact = false,
  className,
}: {
  /** Icon-only, for the 380px column head; the label stays the accessible name. */
  compact?: boolean
  className?: string
}) {
  const [view, setView] = useGigsView()
  return (
    <div
      role="group"
      aria-label={OPEN_GIGS_COPY.view.group}
      className={cn('inline-flex gap-0.5 rounded-button border border-border-default p-[3px]', className)}
    >
      {VIEWS.map(({ key, label, icon: Icon }) => {
        const pressed = view === key
        return (
          <button
            key={key}
            type="button"
            aria-pressed={pressed}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            onClick={() => setView(key)}
            className={cn(
              'inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-2.5 type-body-small font-semibold transition-colors duration-(--motion-fast) ease-(--motion-ease-standard)',
              pressed
                ? 'bg-content-primary text-surface-background'
                : 'text-content-tertiary hover:text-content-primary',
            )}
          >
            <Icon size={14} aria-hidden />
            {!compact && label}
          </button>
        )
      })}
    </div>
  )
}
