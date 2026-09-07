'use client'

/**
 * Create offer: crypto out, fiat in, at YOUR rate — a P2P sell offer on the
 * order book rather than a market-rate cash-out.
 *
 * Validation is `getOfferMissingRequirement` from shared, not a local copy.
 * It returns the FIRST unmet requirement phrased as the button's label, so the
 * CTA always says what is missing instead of sitting disabled and silent.
 */
import {
  CURRENCY_META,
  DEFAULT_ACCEPT_WINDOW_SECONDS,
  EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS,
  formatFiat,
  getOfferMissingRequirement,
  parseUnits,
  payoutCurrencyForCountry,
  SECONDS_PER_HOUR,
  SELL_NO_WALLET_OFFER,
} from '@tenda/shared'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FeeSummary } from '@/components/shared/FeeSummary'
import { useOfferSell } from '@/hooks/exchange/useOfferSell'
import type { AssetSelection } from '@/hooks/wallet/useAssetSelection'
import type { PayoutAccountsState } from '@/hooks/fiat/usePayoutAccounts'
import { MoneyField } from './MoneyField'
import { OfferDeadlines } from './OfferDeadlines'
import { SellAssetAmount } from './SellAssetAmount'
import { SELL_COPY } from './copy'

/**
 * Must resolve to an hours value present in ACCEPT_DEADLINE_OPTIONS, or the
 * panel opens with no chip selected (168h/7d is in the set).
 */
const DEFAULT_ACCEPT_HOURS = DEFAULT_ACCEPT_WINDOW_SECONDS / SECONDS_PER_HOUR

export const OFFER_SELL_COPY = {
  rateLabel: 'Your rate',
  rateNote: 'Fiat per whole unit — what a buyer pays for one of them.',
  total: 'Buyer pays',
  submit: 'Post offer',
} as const

export function OfferSellPanel({
  selection,
  payout,
  amount,
  onAmountChange,
}: {
  selection: AssetSelection
  payout: PayoutAccountsState
  amount: string
  onAmountChange: (next: string) => void
}) {
  const [rate, setRate] = useState('')
  const [acceptHours, setAcceptHours] = useState(DEFAULT_ACCEPT_HOURS)
  const [paymentWindowSeconds, setPaymentWindowSeconds] = useState(
    EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS,
  )
  const { submitting, submit } = useOfferSell()

  const option = selection.option
  const account = payout.selected
  const currency = payoutCurrencyForCountry(account?.country ?? null)

  const rateNum = Number(rate)
  const amountRaw = option !== null ? parseUnits(amount, option.decimals) : null
  // Floor to whole minor units: a total the buyer cannot actually transfer is
  // not a total.
  const fiatTotal = Math.floor(Number(amount) * rateNum * 100) / 100
  const missing = getOfferMissingRequirement({
    hasAsset: option !== null,
    amountRaw,
    rate: rateNum,
    fiatTotal,
    // An account whose country resolves to no currency is not a usable payout
    // account (a retired market's saved account) — same fold as mobile's
    // OfferSellTab, so the CTA stays disabled with the existing reason.
    hasPayoutAccount: account !== null && currency !== null,
  })

  function handleSubmit(): void {
    // Unreachable through the UI — the button carrying this is disabled until
    // `missing` is null — and kept anyway: this function is the only thing
    // standing between a caller and a real escrow, and the next caller may not
    // be a disabled button. The narrowing also earns its keep for TypeScript.
    if (missing !== null || option === null || amountRaw === null || account === null || currency === null) return
    void submit({
      option,
      amountRaw,
      account,
      fiatTotal,
      currency,
      rate: rateNum,
      acceptHours,
      paymentWindowSeconds,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <SellAssetAmount
        selection={selection}
        amount={amount}
        onAmountChange={onAmountChange}
        noWalletMessage={SELL_NO_WALLET_OFFER}
      />

      <MoneyField
        id="offer-rate"
        label={OFFER_SELL_COPY.rateLabel}
        value={rate}
        onChange={setRate}
        prefix={currency === null ? '' : CURRENCY_META[currency].symbol}
        suffix={`/ ${option?.symbol ?? ''}`}
        note={OFFER_SELL_COPY.rateNote}
      />

      <OfferDeadlines
        acceptHours={acceptHours}
        onAcceptChange={setAcceptHours}
        paymentWindowSeconds={paymentWindowSeconds}
        onPaymentWindowChange={setPaymentWindowSeconds}
      />

      {/* No currency (no account yet, or a retired market's account) → no
          total: a figure in a guessed currency is worse than none (mobile's
          OfferSellTab rule). */}
      {fiatTotal > 0 && Number.isFinite(fiatTotal) && currency !== null && (
        <div className="flex items-baseline justify-between gap-4 rounded-card border border-border-subtle bg-surface-inset px-5 py-4">
          <span className="type-body-small text-content-secondary">
            {OFFER_SELL_COPY.total}
          </span>
          <span className="text-right font-numeric text-xl font-bold leading-[26px] text-utility-money">
            {formatFiat(fiatTotal, currency)}
          </span>
        </div>
      )}

      {option !== null && amountRaw !== null && amountRaw !== '0' && (
        <FeeSummary variant="exchange" asset={option.assetId} principalRaw={amountRaw} />
      )}

      <div>
        <Button fullWidth disabled={missing !== null || submitting} onClick={handleSubmit}>
          {missing ?? OFFER_SELL_COPY.submit}
        </Button>
        <p className="mt-2.5 text-center text-xs leading-4 text-content-tertiary">
          {SELL_COPY.ctaNote('offer')}
        </p>
      </div>
    </div>
  )
}
