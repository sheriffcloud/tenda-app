import type { CSSProperties } from 'react'
import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { SURFACE_TOKEN } from '@/components/ui/surface'
import { Period, SectionHead, SectionRule } from '@/components/ui/SectionRule'
import { MarqueeRow } from '@/components/ui/MarqueeRow'
import { Pill } from '@/components/ui/Pill'
import { TaskRow } from '@/components/product/TaskRow'
import { CATEGORIES, EXAMPLE_TASKS, GIG_CATEGORIES, type ExampleTask } from '@/content'
import { TASK_WALL_HEADER } from './content'

/**
 * Two counter-running lanes. Different tempos so the pair never locks into
 * step and reads as one block sliding sideways.
 */
const LANES = [
  { speedSec: 70, direction: 'left' as const },
  { speedSec: 78, direction: 'right' as const },
]

/**
 * §02 Tasks wall — two ruled tickers running past both page edges, then the
 * five gig categories in the app's own category tones, closed by the one
 * live chip: every city on the feed is a market the payout registry settles.
 *
 * The ticker's edge fades dissolve the rows into the section's OWN ground.
 * The section does not know its ground — the page derives it from position
 * (#55) — so it forwards the token it was handed to the CSS as
 * `--tick-ground`. Pinning the alt token in the stylesheet worked only while
 * this section happened to sit at an odd index.
 */
export function TaskWall({ surface }: LandingSectionProps) {
  const perLane = Math.ceil(EXAMPLE_TASKS.length / LANES.length)
  const lanes: ExampleTask[][] = LANES.map((_, i) =>
    EXAMPLE_TASKS.slice(i * perLane, (i + 1) * perLane),
  )
  const [line1, line2] = TASK_WALL_HEADER.h2
  const ground = { '--tick-ground': `var(${SURFACE_TOKEN[surface]})` } as CSSProperties

  return (
    <SectionShell id="tasks" surface={surface}>
      <SectionRule title={TASK_WALL_HEADER.eyebrow} aside={TASK_WALL_HEADER.aside} />
      <SectionHead lede={TASK_WALL_HEADER.sub}>
        {line1}
        <br />
        {line2}<Period />
      </SectionHead>

      {/* Full-bleed: the claim is breadth, and a feed that stops at the
          content column reads as a widget rather than as work going past. */}
      <div className="full-bleed mt-[clamp(30px,4vw,52px)]" style={ground}>
        {lanes.map((tasks, i) => (
          <div key={LANES[i].speedSec} className="tick">
            <MarqueeRow
              items={tasks}
              keyOf={(task) => task.id}
              renderItem={(task) => <TaskRow task={task} />}
              direction={LANES[i].direction}
              speedSec={LANES[i].speedSec}
            />
          </div>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-2">
        {GIG_CATEGORIES.map((id) => (
          <Pill key={id} category={id}>
            {CATEGORIES[id].emoji} {CATEGORIES[id].label}
          </Pill>
        ))}
        <Pill tone="live" dot>
          {TASK_WALL_HEADER.marketsNote}
        </Pill>
      </div>
    </SectionShell>
  )
}
