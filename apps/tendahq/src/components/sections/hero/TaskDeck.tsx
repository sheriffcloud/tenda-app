import { SwipeDeck } from '@/components/ui/SwipeDeck'
import { TaskCard } from '@/components/product/TaskCard'
import { EXAMPLE_TASKS } from '@/content'
import { HERO_CONTENT } from './content'

/**
 * Hero centerpiece — example gigs swiping up through a stacked deck, one
 * every few seconds, sourced from content/tasks.ts. A soft brand glow sits
 * behind the stack so the front card reads as the section's focal point.
 */
export function TaskDeck() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--brand) 16%, transparent)' }}
      />
      {/* Height owns the deck: lg TaskCard (~168px) + stack offsets. */}
      <SwipeDeck
        items={EXAMPLE_TASKS}
        keyOf={(task) => task.id}
        renderItem={(task) => <TaskCard task={task} size="lg" />}
        className="h-[240px]"
      />
      <p className="caption mt-3 text-center uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
        {HERO_CONTENT.deckCaption}
      </p>
    </div>
  )
}
