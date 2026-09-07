import { Clock } from 'lucide-react'
import { Pill } from '@/components/ui/Pill'
import { CATEGORIES } from '@/data/categories'
import type { ExampleTask } from '@/content'
import { cn } from '@/lib/cn'

interface Props {
  task: ExampleTask
  /** `lg` = hero deck card (roomier, escrow pill); `md` = tasks-wall card. */
  size?: 'md' | 'lg'
  className?: string
}

/**
 * A showcased gig, styled after the mobile app's gig card: category chip,
 * title, USDC amount, city. Used by the hero TaskDeck and the tasks wall.
 */
export function TaskCard({ task, size = 'md', className }: Props) {
  const cat = CATEGORIES[task.category]
  const lg = size === 'lg'

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)]',
        'shadow-[var(--shadow-card)]',
        lg ? 'gap-4 p-5' : 'gap-3 p-4',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="caption inline-flex items-center gap-1 rounded-md bg-[var(--surface-inset)] px-2 py-1 font-bold uppercase tracking-[0.06em] text-[var(--content-secondary)]">
          {cat.emoji} {cat.label}
        </span>
        <span className="mono-sm ml-auto inline-flex items-center gap-1 text-[var(--content-tertiary)]">
          <Clock className="h-3 w-3" />
          {task.countdown}
        </span>
      </div>

      <p
        className={cn(
          'font-semibold text-[var(--content-primary)]',
          lg ? 'body-lg' : 'body',
        )}
      >
        {task.title}
      </p>

      <div className="flex items-center gap-2">
        <span className={cn('mono text-[var(--content-primary)]', lg && 'mono-mid')}>
          {task.amountUsdc} USDC
        </span>
        {lg && (
          <Pill tone="brand" size="sm" dot>
            Escrow locked
          </Pill>
        )}
        <span className="mono-sm ml-auto text-[var(--content-tertiary)]">
          {task.flag} {task.city}
        </span>
      </div>
    </article>
  )
}
