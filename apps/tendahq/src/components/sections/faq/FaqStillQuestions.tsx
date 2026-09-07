import { ArrowRight } from 'lucide-react'
import { STILL_QUESTIONS } from './content'

/**
 * Bottom strip — soft brand-blue gradient band with the community links.
 */
export function FaqStillQuestions() {
  return (
    <div
      className="relative mt-10 flex flex-col gap-4 overflow-hidden rounded-3xl border p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--brand) 8%, transparent), color-mix(in oklab, var(--brand) 2%, transparent))',
        borderColor: 'color-mix(in oklab, var(--brand) 24%, transparent)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, color-mix(in oklab, var(--brand) 50%, transparent), transparent)',
        }}
      />

      <div className="min-w-0 flex-1">
        <p className="h3 text-[var(--content-primary)]">{STILL_QUESTIONS.title}</p>
        <p className="body-sm mt-2 max-w-[58ch] text-[var(--content-secondary)]">
          {STILL_QUESTIONS.body}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STILL_QUESTIONS.links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target={l.href.startsWith('http') ? '_blank' : undefined}
            rel={l.href.startsWith('http') ? 'noreferrer' : undefined}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[color-mix(in_oklab,var(--surface-card)_70%,transparent)] px-3.5 py-2 text-sm font-semibold text-[var(--content-primary)] backdrop-blur-sm transition-colors hover:border-[var(--brand-border)] hover:text-[var(--brand)]"
          >
            {l.label}
            <ArrowRight className="h-3 w-3" />
          </a>
        ))}
      </div>
    </div>
  )
}
