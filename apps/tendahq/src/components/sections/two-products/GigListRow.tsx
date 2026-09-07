import { Clock } from 'lucide-react'
import { CATEGORIES } from '@/data/categories'
import type { ExampleTask } from '@/content'
import { cn } from '@/lib/cn'

interface Props {
  task: ExampleTask
  className?: string
}

/**
 * Dense single-line gig row used inside the §03 Gigs panel preview. Differs
 * from the standalone <TaskCard> on purpose — that one is the marketplace
 * card with chip + title on separate lines; this one collapses to a single
 * line to fit the panel-preview density.
 */
export function GigListRow({ task, className }: Props) {
  const cat = CATEGORIES[task.category]
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2.5',
        className,
      )}
    >
      <span className="caption inline-flex items-center gap-1 rounded-md bg-[var(--surface-inset)] px-2 py-1 font-bold uppercase tracking-[0.06em] text-[var(--content-secondary)]">
        {cat.emoji} {cat.label}
      </span>

      <p className="body-sm min-w-0 flex-1 truncate text-[var(--content-primary)]">
        {task.title}
        <span className="ml-1.5 mono-sm text-[var(--content-tertiary)]">
          · {task.flag} {task.city}
        </span>
      </p>

      <span className="mono shrink-0 text-[var(--content-primary)]">
        {task.amountUsdc} USDC
      </span>

      <span className="mono-sm inline-flex w-[70px] shrink-0 items-center justify-end gap-1 text-[var(--content-tertiary)]">
        <Clock className="h-3 w-3" />
        {task.countdown}
      </span>
    </div>
  )
}
