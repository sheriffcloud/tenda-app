import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { ListTab } from './list.types'

/**
 * List-column header: title, the ⌘K affordance, optional counted tabs, and
 * the monospace count line (Tier 2 comp, lines 390-411).
 */
export function ListHeader({
  title,
  titleId,
  countLabel,
  tabs,
  onOpenPalette,
  tools,
  filters,
}: {
  title: string
  titleId: string
  countLabel?: string
  tabs?: readonly ListTab[]
  onOpenPalette?: () => void
  /** Controls on the title row's right — a view toggle (#60). */
  tools?: ReactNode
  /** Controls under the title row — a search field, a chip row (#60). */
  filters?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border-subtle px-4 pb-3 pt-[18px]">
      <div className="flex items-center gap-2.5">
        <h1
          id={titleId}
          className="font-display text-lg font-semibold leading-6 text-content-primary"
        >
          {title}
        </h1>
        {/* The count sits beside the title, as the #60 preview's column
            head draws it — one line for "what" and "how many". */}
        {countLabel !== undefined && countLabel !== '' && (
          <p className="font-numeric text-xs leading-4 text-content-tertiary">{countLabel}</p>
        )}
        <span className="flex-1" aria-hidden />
        {tools}
        {onOpenPalette !== undefined && (
          <button
            type="button"
            onClick={onOpenPalette}
            // Icon-free affordance, so the glyph IS the label; give assistive
            // tech the real name rather than the two characters.
            aria-label="Open command palette"
            title="Command palette"
            className="rounded-control border border-border-default px-2 py-[5px] font-numeric type-caption font-bold text-content-tertiary transition-colors duration-(--motion-fast) ease-(--motion-ease-standard) hover:bg-surface-inset hover:text-content-primary"
          >
            <span aria-hidden>⌘K</span>
          </button>
        )}
      </div>

      {tabs !== undefined && tabs.length > 0 && (
        <div className="flex gap-1.5">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.current === true ? 'page' : undefined}
              className={cn(
                'rounded-control px-2.5 py-1 type-body-small font-semibold transition-colors duration-(--motion-fast) ease-(--motion-ease-standard)',
                tab.current === true
                  ? 'bg-control-selected-background text-brand-primary'
                  : 'text-content-secondary hover:bg-surface-inset hover:text-content-primary',
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 font-numeric type-caption opacity-70">{tab.count}</span>
              )}
            </Link>
          ))}
        </div>
      )}

      {filters}
    </header>
  )
}
