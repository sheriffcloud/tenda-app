import { GIG_ASSET_SYMBOL, type ExampleTask } from '@/content'

/**
 * A showcased gig as ONE LINE, for the horizontal tasks ticker: flag, title,
 * city in the eyebrow face, the amount in mono, the time left. A specimen,
 * not an object to act on — the section's claim is the BREADTH of work, and
 * thirty rows sharing an amount column make the range legible in a way
 * thirty cards never did.
 */
export function TaskRow({ task }: { task: ExampleTask }) {
  return (
    <div className="flex items-center gap-[13px] whitespace-nowrap border-r border-[var(--border-subtle)] px-6 py-[11px]">
      <span aria-hidden className="text-[14px] leading-none">
        {task.flag}
      </span>
      <span className="text-[14px] text-[var(--content-primary)]">{task.title}</span>
      <span className="eyebrow text-[var(--content-tertiary)]">{task.city}</span>
      <span className="font-[var(--font-mono)] text-[13px] font-semibold tabular-nums text-[var(--content-primary)]">
        {task.amountUsdc} {GIG_ASSET_SYMBOL}
      </span>
      <span className="font-[var(--font-mono)] text-[10.5px] text-[var(--content-tertiary)]">
        {task.countdown}
      </span>
    </div>
  )
}
