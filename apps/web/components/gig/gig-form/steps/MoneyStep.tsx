'use client'

/**
 * Step 5 — the amount, the projection, and what is about to be published.
 *
 * ONE fee projection, ONE source: FeeSummary reads useEscrowFee and nothing
 * here recomputes it. The comp's own arithmetic (net + fee + gas as "what you
 * lock") describes a different contract from the one that ships — here the
 * poster locks the budget and the platform fee is deducted from the WORKER's
 * payout at settlement — so the comp's figures are deliberately not copied.
 */
import { hasGigBudget } from '@tenda/shared'
import { NetworkPicker } from '../NetworkPicker'
import { AddFundsNudge } from '../AddFundsNudge'
import { PaymentInput } from '@/components/form/PaymentInput'
import { FeeSummary } from '@/components/shared/FeeSummary'
import { SectionLabel } from './parts'
import { buildReviewRows } from './review-rows'
import type { GigFormController } from '@/hooks/gig/useGigForm'

export function MoneyStep({ form }: { form: GigFormController }) {
  const networkLabel =
    form.chainOptions.find((c) => c.id === form.chainId)?.label ?? form.chainId
  const rows = buildReviewRows({
    category: form.selectedCategory,
    remote: form.isRemote,
    country: form.selectedCountry,
    city: form.selectedCity,
    acceptDeadlineHours: form.acceptDeadlineHours,
    completionDuration: form.completionDuration,
    proofRequirements: form.proofRequirements,
    requiresApproval: form.requiresApproval,
    networkLabel,
  })

  return (
    <div className="mt-7 flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionLabel>Settles on</SectionLabel>
        <NetworkPicker
          options={form.chainOptions}
          selected={form.chainId}
          onSelect={form.selectChain}
          assetSymbol={form.assetSymbol}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>The budget</SectionLabel>
        <PaymentInput asset={form.asset} value={form.paymentRaw} onChange={form.setPaymentRaw} />
        <AddFundsNudge chainId={form.chainId} asset={form.asset} paymentRaw={form.paymentRaw} />
        {hasGigBudget(form.paymentRaw) && (
          <FeeSummary asset={form.asset} principalRaw={form.paymentRaw} />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>What you are publishing</SectionLabel>
        <dl className="rounded-card border border-border-default bg-surface-card px-4 py-1">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0"
            >
              <dt className="text-sm text-content-secondary">{row.label}</dt>
              <dd className="text-right text-sm font-semibold text-content-primary">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
