'use client'

/**
 * The quote panel (Tier-3 comp, lines 738-755): the figures the reader is
 * agreeing to, and how long they have to agree to them.
 *
 * The expiry is not decoration. `useInstantSell` refuses to submit against an
 * expired quote — it re-quotes instead — so the countdown is the reader's
 * warning that the button is about to stop meaning what it says. It goes amber
 * then red on the SAME shared thresholds every other clock in the app uses.
 */
import { RotateCw } from 'lucide-react'
import {
  countdownTone,
  formatFiat,
  formatRate,
  type CountdownTone,
  type FiatQuoteResponse,
  type SupportedCurrency,
} from '@tenda/shared'
import { cn } from '@/lib/cn'
import { SELL_COPY } from './copy'

/** Seconds → the shared tone thresholds, which are expressed in ms. */
const MS = 1_000

const EXPIRY_CLASS: Record<CountdownTone, string> = {
  normal: 'text-content-tertiary',
  warning: 'text-feedback-warning-base',
  danger: 'text-feedback-danger-base',
  expired: 'text-feedback-danger-base',
}

export function QuoteSummary({
  quote,
  expiresIn,
  currency,
  assetSymbol,
  onRefresh,
}: {
  quote: FiatQuoteResponse
  /** Seconds left, already ticking in `useFiatQuote`. */
  expiresIn: number
  currency: SupportedCurrency
  assetSymbol: string
  onRefresh: () => void
}) {
  const tone = countdownTone(expiresIn * MS)
  const expired = expiresIn <= 0

  const lines: { label: string; value: string; money?: boolean }[] = [
    // `formatRate`, not `formatFiat`: a rate keeps its decimals. The amount
    // rows below it do not — whole units are right for a fee and a total.
    // Third time this distinction has mattered (web #18 F4, mobile #29).
    { label: SELL_COPY.quote.rate, value: `${formatRate(quote.rate, currency)} / ${assetSymbol}` },
    { label: SELL_COPY.quote.fee, value: formatFiat(quote.fee_amount, currency) },
    { label: SELL_COPY.quote.receive, value: formatFiat(quote.fiat_amount, currency), money: true },
  ]

  return (
    <div className="rounded-card border border-border-default bg-surface-card p-5">
      <dl className="flex flex-col gap-3">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-4">
            <dt className="type-body-small text-content-secondary">{line.label}</dt>
            <dd
              className={cn(
                'text-right font-numeric font-bold',
                line.money
                  ? 'text-xl leading-[26px] text-utility-money'
                  : 'type-body text-content-primary',
              )}
            >
              {line.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3.5">
        {expired ? (
          <p className="type-body-small text-feedback-danger-base">
            <span className="font-semibold">{SELL_COPY.quote.expired}</span>, {SELL_COPY.quote.expiredBody}
          </p>
        ) : (
          <p className={cn('font-numeric type-body-small', EXPIRY_CLASS[tone])}>
            {SELL_COPY.quote.expires} <span className="font-bold">{expiresIn}s</span>
          </p>
        )}
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-control border border-border-default px-3 py-1.5 type-body-small font-semibold text-content-primary transition-colors duration-(--motion-fast) hover:border-border-strong"
        >
          <RotateCw size={14} aria-hidden />
          {SELL_COPY.quote.refresh}
        </button>
      </div>
    </div>
  )
}
