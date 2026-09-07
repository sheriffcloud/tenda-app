import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface AccordionItem {
  id: string
  /** ReactNode so callers can mix coloured prefixes (e.g. green `Q.01 ·`) into the heading. */
  question: ReactNode
  answer: ReactNode
}

interface Props {
  items: readonly AccordionItem[]
  /** Index of item open on mount; null = all closed. Default null. */
  defaultOpen?: string | null
  className?: string
}

/**
 * Single-open accordion. Animates height via grid-template-rows trick — works
 * without measuring and respects reduced-motion automatically (transition skips
 * because the user-agent disables transitions).
 */
export function Accordion({ items, defaultOpen = null, className }: Props) {
  const [openId, setOpenId] = useState<string | null>(defaultOpen)

  return (
    <div className={cn('flex flex-col divide-y divide-[var(--border-subtle)]', className)}>
      {items.map((item) => {
        const isOpen = openId === item.id
        return (
          <AccordionRow
            key={item.id}
            item={item}
            isOpen={isOpen}
            onToggle={() => setOpenId(isOpen ? null : item.id)}
          />
        )
      })}
    </div>
  )
}

function AccordionRow({
  item,
  isOpen,
  onToggle,
}: {
  item: AccordionItem
  isOpen: boolean
  onToggle: () => void
}) {
  const headingId = useId()
  const panelId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)

  return (
    <div className="py-1">
      <h3>
        <button
          type="button"
          id={headingId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          className={cn(
            'flex w-full items-center justify-between gap-4 py-5 text-left',
            'transition-colors hover:text-[var(--brand)]',
          )}
        >
          <span
            className={cn(
              // Question lead on mobile: tighter than .h3 (22px) so an 8-row
              // accordion doesn't dominate the viewport. Scales back up at sm+.
              'font-[var(--font-display)] font-semibold tracking-[-0.01em] text-[var(--content-primary)]',
              'text-[15px] leading-[1.35] sm:text-[19px] md:text-[22px] md:leading-[1.3]',
            )}
          >
            {item.question}
          </span>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-[var(--content-tertiary)] transition-transform duration-200',
              isOpen && 'rotate-180 text-[var(--brand)]',
            )}
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div ref={panelRef} className="overflow-hidden">
          <div className="body pb-5 pr-8 text-[var(--content-secondary)]">{item.answer}</div>
        </div>
      </div>
    </div>
  )
}
