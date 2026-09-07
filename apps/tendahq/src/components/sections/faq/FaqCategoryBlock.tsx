import { Accordion, type AccordionItem } from '@/components/ui/Accordion'
import type { FaqCategory } from './types'

interface Props {
  category: FaqCategory
}

/**
 * One category section. Accordion is single-open scoped to this category — a
 * Q open in another category stays open. Categories are independent for FAQ
 * skim ergonomics.
 */
export function FaqCategoryBlock({ category }: Props) {
  const items: AccordionItem[] = category.questions.map((q) => ({
    id: q.id,
    question: (
      <>
        <span className="mono mr-2 font-semibold text-[var(--accent)]">{q.id}</span>
        <span className="text-[var(--content-primary)]">{q.question}</span>
      </>
    ),
    answer: (
      <div className="flex flex-col gap-3 body text-[var(--content-secondary)]">{q.answer}</div>
    ),
  }))

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 sm:p-8">
      <header className="flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-baseline gap-3">
          <span className="mono font-semibold text-[var(--accent)]">{category.num}</span>
          <h3 className="h3 text-[var(--content-primary)]">{category.title}</h3>
        </div>
        <span className="caption uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
          {category.caption}
        </span>
      </header>

      <Accordion items={items} />
    </section>
  )
}
