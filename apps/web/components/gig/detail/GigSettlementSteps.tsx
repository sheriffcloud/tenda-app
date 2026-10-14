/**
 * The four steps between reading this page and being paid (comp lines
 * 673-680).
 *
 * Step one depends on the ACCEPTANCE MODE, which is exactly why the comp
 * templates it: on an approval-mode gig you apply and wait to be picked, and
 * telling someone the work is theirs the moment they take it would be the
 * bait-and-switch `requires_approval` exists on the summary to prevent.
 */
import Link from 'next/link'
import { Eyebrow } from '@/components/ui'
import { GIG_DETAIL_COPY } from './copy'

export function GigSettlementSteps({ requiresApproval }: { requiresApproval: boolean }) {
  const steps = [
    requiresApproval
      ? GIG_DETAIL_COPY.settleSteps.apply
      : GIG_DETAIL_COPY.settleSteps.accept,
    ...GIG_DETAIL_COPY.settleSteps.rest,
  ]

  return (
    <div className="rounded-card border border-border-subtle bg-surface-inset p-5">
      <Eyebrow as="h2">{GIG_DETAIL_COPY.settleTitle}</Eyebrow>
      <ol className="mt-3.5 flex list-decimal flex-col gap-2.5 pl-5 type-body-small text-content-secondary">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Link
        href="/support/escrow"
        className="mt-4 inline-block type-body-small font-semibold text-content-link"
      >
        {GIG_DETAIL_COPY.settleLink} →
      </Link>
    </div>
  )
}
