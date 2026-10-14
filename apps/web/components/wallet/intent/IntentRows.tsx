'use client'

/**
 * The intent's figures (Tier-3 comp, lines 801-808) — a definition grid of
 * what was agreed, so the banner above it can stay one sentence.
 *
 * The rate row uses `formatRate`: a rate keeps its decimals, and rounding it
 * to whole units is the same defect this app has now fixed on the order book
 * (web #18) and on mobile (#29).
 */
import {
  formatAssetAmount,
  formatDate,
  formatFiat,
  formatRate,
  type FiatIntentDetail,
} from '@tenda/shared'
import { INTENT_COPY } from './copy'

export function IntentRows({ intent }: { intent: FiatIntentDetail }) {
  const currency = intent.fiat_currency
  const rows: { label: string; value: string }[] = [
    { label: INTENT_COPY.rows.amount, value: formatAssetAmount(intent.asset_amount_raw, intent.asset) },
    { label: INTENT_COPY.rows.receive, value: formatFiat(Number(intent.fiat_amount), currency) },
    { label: INTENT_COPY.rows.rate, value: formatRate(Number(intent.rate), currency) },
    { label: INTENT_COPY.rows.fee, value: formatFiat(Number(intent.fee_amount), currency) },
    { label: INTENT_COPY.rows.provider, value: intent.provider },
    { label: INTENT_COPY.rows.started, value: formatDate(intent.created_at) },
    // Last, and a real value: it is what a support conversation needs.
    { label: INTENT_COPY.rows.reference, value: intent.id },
  ]

  return (
    <section className="mt-8 border-t border-border-subtle pt-6">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-8 gap-y-5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="mb-1 type-body-small text-content-tertiary">{row.label}</dt>
            <dd className="break-words type-mono font-semibold text-content-primary">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
