import { Period } from '@/components/ui/SectionRule'
import { Pill } from '@/components/ui/Pill'
import { cn } from '@/lib/cn'
import type { ProductPanel as ProductPanelData } from './content'

interface Props {
  panel: ProductPanelData
  /** The dividing rule between the two halves; the parent decides which side. */
  className?: string
}

/**
 * One half of the §03 sheet. NO CARD CHROME OF ITS OWN: the two halves are
 * one surface divided by a hairline, because the copy's whole point is that
 * gigs and exchange are ONE app, and two cards would say otherwise.
 */
export function ProductPanel({ panel, className }: Props) {
  return (
    <article className={cn('flex flex-col p-[clamp(26px,3.2vw,38px)]', className)}>
      <header className="flex items-center gap-2.5">
        <span className="font-[var(--font-mono)] text-[11px] font-semibold tracking-[0.95px] text-[var(--content-primary)]">
          {panel.name}
        </span>
        <Pill className="ml-auto">{panel.count}</Pill>
      </header>

      <h3 className="h2 mt-[22px] max-w-[17ch] text-[var(--content-primary)]">
        {panel.headline}<Period />
      </h3>
      <p className="mt-3.5 text-[14.5px] leading-[23px] text-[var(--content-secondary)]">{panel.body}</p>

      <ul className="mt-[22px] border-t border-[var(--border-subtle)]">
        {panel.rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-3"
          >
            <span className="min-w-0 truncate text-[13.5px] text-[var(--content-primary)]">{row.label}</span>
            <span className="ml-auto whitespace-nowrap font-[var(--font-mono)] text-[12.5px] font-semibold tabular-nums text-[var(--content-primary)]">
              {row.value}
            </span>
          </li>
        ))}
      </ul>

      <footer className="mt-[18px]">
        <span className="eyebrow leading-4 text-[var(--content-tertiary)]">{panel.foot}</span>
      </footer>
    </article>
  )
}
