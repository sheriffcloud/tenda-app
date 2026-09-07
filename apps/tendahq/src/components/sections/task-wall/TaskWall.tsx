import { SectionShell } from '@/components/ui/SectionShell'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { MarqueeRow } from '@/components/ui/MarqueeRow'
import { TaskCard } from '@/components/product/TaskCard'
import { EXAMPLE_TASKS, type ExampleTask } from '@/content'
import { TASK_WALL_HEADER } from './content'

/** Column tempos — asymmetric speed + direction keeps the wall alive. */
const COLUMNS = [
  { speedSec: 52, direction: 'left' as const },
  { speedSec: 66, direction: 'right' as const },
  { speedSec: 58, direction: 'left' as const },
]

/**
 * §02 Tasks wall — straight after the hero: three
 * counter-scrolling columns of example gigs (single column on mobile), all
 * sourced from content/tasks.ts.
 */
export function TaskWall() {
  const perColumn = Math.ceil(EXAMPLE_TASKS.length / COLUMNS.length)
  const columns: ExampleTask[][] = COLUMNS.map((_, i) =>
    EXAMPLE_TASKS.slice(i * perColumn, (i + 1) * perColumn),
  )

  return (
    <SectionShell id="tasks" surface="alt" padY="lg">
      <div className="mb-12 flex max-w-[62ch] flex-col gap-4">
        <Eyebrow tone="brand" dot>
          {TASK_WALL_HEADER.eyebrow.num} · {TASK_WALL_HEADER.eyebrow.label}
        </Eyebrow>
        <h2 className="h1 text-[var(--content-primary)]">
          {TASK_WALL_HEADER.h2.lead}{' '}
          <span className="text-[var(--brand)]">{TASK_WALL_HEADER.h2.emphasis}</span>
        </h2>
        <p className="body-lg text-[var(--content-secondary)]">{TASK_WALL_HEADER.sub}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((tasks, i) => (
          <MarqueeRow
            key={COLUMNS[i].speedSec}
            items={tasks}
            keyOf={(task) => task.id}
            renderItem={(task) => <TaskCard task={task} />}
            axis="y"
            direction={COLUMNS[i].direction}
            speedSec={COLUMNS[i].speedSec}
            className={i === 0 ? 'h-[420px] md:h-[520px]' : 'hidden h-[520px] md:block'}
          />
        ))}
      </div>
    </SectionShell>
  )
}
