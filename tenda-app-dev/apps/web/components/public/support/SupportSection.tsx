/**
 * The structured pieces the guide pages are built from.
 *
 * The comp's article variant is plain prose — four paragraphs at 17/28. Our
 * guides carry more than that: numbered steps, per-step warnings and tips, and
 * a wallet-by-wallet breakdown, all of it already written and shared with
 * mobile. Rendering that as flat paragraphs would be a regression dressed as
 * fidelity, so the comp's TYPOGRAPHY is adopted and its structure is not.
 *
 * Native `<details>` for the same reason the FAQ uses it: these are anonymous
 * public pages and the answers belong in the HTML, not behind a bundle.
 */
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

export function SupportAccordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-card border border-border-subtle bg-surface-card shadow-card"
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 break-words font-display type-title text-content-primary">
          {title}
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className="shrink-0 text-content-tertiary transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-4 border-t border-border-subtle px-5 py-5">{children}</div>
    </details>
  )
}

export interface GuideStepData {
  title: string
  description: string
  warning?: string
  tip?: string
}

export function GuideSteps({ steps }: { steps: readonly GuideStepData[] }) {
  return (
    <ol className="flex list-none flex-col gap-5 p-0">
      {steps.map((step, index) => (
        <li key={step.title} className="flex min-w-0 gap-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary-surface font-numeric type-body-small font-bold text-brand-primary">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="break-words font-semibold text-content-primary">{step.title}</p>
            <p className="mt-1 max-w-[62ch] break-words type-body text-content-secondary">
              {step.description}
            </p>
            {/* A warning is a thing that can cost the reader money, so it gets
                the feedback tone rather than a bold sentence in the flow. */}
            {step.warning !== undefined && (
              <p className="mt-2.5 rounded-control border border-feedback-warning-border bg-feedback-warning-surface px-3 py-2 type-body-small text-feedback-warning-text">
                {step.warning}
              </p>
            )}
            {step.tip !== undefined && (
              <p className="mt-2 type-body-small text-content-tertiary">
                Tip: {step.tip}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** A standing fact about the topic, above the steps that use it. */
export function InfoCard({
  label,
  body,
  children,
}: {
  label: string
  body?: string
  children?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-card border border-border-subtle bg-surface-inset p-5">
      <h2 className="font-display type-title text-content-primary">
        {label}
      </h2>
      {body !== undefined && (
        <p className="max-w-[62ch] type-body text-content-secondary">{body}</p>
      )}
      {children}
    </section>
  )
}
