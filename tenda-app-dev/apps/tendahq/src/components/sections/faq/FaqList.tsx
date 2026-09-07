import { useState } from 'react'
import { cn } from '@/lib/cn'
import type { FaqCategory, FaqQuestion } from './types'

interface Props {
  categories: readonly FaqCategory[]
}

/** The category a question is tagged with, in the margin. */
interface Tagged {
  tag: string
  question: FaqQuestion
}

/**
 * The FAQ as one ruled list, single-open, the first question open on load
 * so the page is at rest with an answer showing. The disclosure is a real
 * button with `aria-expanded`; the answer region is labelled by it.
 */
export function FaqList({ categories }: Props) {
  const rows: Tagged[] = categories.flatMap((c) =>
    c.questions.map((question) => ({ tag: c.title, question })),
  )
  const [openId, setOpenId] = useState<string | null>(rows[0]?.question.id ?? null)

  return (
    <div className="mt-[clamp(26px,3.4vw,42px)] border-t border-[var(--border-default)]">
      {rows.map(({ tag, question }) => {
        const open = openId === question.id
        const panelId = `faq-panel-${question.id}`
        const buttonId = `faq-q-${question.id}`
        return (
          <div key={question.id} className="border-b border-[var(--border-subtle)]">
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : question.id)}
                className="flex w-full items-baseline gap-4 py-5 text-left"
              >
                <span className="eyebrow hidden w-[76px] shrink-0 pt-1 text-[var(--content-tertiary)] sm:inline">
                  {tag}
                </span>
                <span className="title flex-1 text-[var(--content-primary)]">{question.question}</span>
                <span
                  aria-hidden
                  className={cn(
                    'ml-auto shrink-0 font-[var(--font-mono)] text-[16px] leading-none text-[var(--content-tertiary)] transition-transform duration-[var(--duration-slow)] ease-[var(--easing-standard)]',
                    open && 'rotate-45 text-[var(--brand-primary)]',
                  )}
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!open}
              className="max-w-[78ch] pb-[22px] text-[14.5px] leading-6 text-[var(--content-secondary)] sm:pl-[92px]"
            >
              <div className="flex flex-col gap-3">{question.answer}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
