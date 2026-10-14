'use client'

/**
 * Instant cash-out: crypto out, fiat in, at the live market rate.
 *
 * The panel's states are the quote's states, and they are kept apart on
 * purpose. "No route right now" is not a failure of the request — the rails
 * answered, and the answer was no — so it is not offered a retry that would
 * only ask the same question. A broken request is, because retrying that one
 * can work.
 */
import Link from 'next/link'
import { P2P_PROVIDER_ID, parseUnits, SELL_NO_WALLET_INSTANT } from '@tenda/shared'
import { AlertPanel, ALERT_ACTION_CLASS } from '@/components/ui/AlertPanel'
import { Button } from '@/components/ui/Button'
import { FeeSummary } from '@/components/shared/FeeSummary'
import { Spinner } from '@/components/ui/Spinner'
import { useInstantSell } from '@/hooks/fiat/useInstantSell'
import type { AssetSelection } from '@/hooks/wallet/useAssetSelection'
import type { PayoutAccountsState } from '@/hooks/fiat/usePayoutAccounts'
import { QuoteSummary } from './QuoteSummary'
import { SellAssetAmount } from './SellAssetAmount'
import { SELL_COPY, sellHref } from './copy'

export function InstantSellPanel({
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
  const option = selection.option
  const amountRaw = option !== null ? parseUnits(amount, option.decimals) : null
  const amountValid = amountRaw !== null && amountRaw !== '0'
  const account = payout.selected

  const { quote, expiresIn, loading, error, refetch, currency, submitting, confirm } = useInstantSell({
    option,
    amountRaw,
    account,
  })

  return (
    <div className="flex flex-col gap-5">
      <SellAssetAmount
        selection={selection}
        amount={amount}
        onAmountChange={onAmountChange}
        noWalletMessage={SELL_NO_WALLET_INSTANT}
      />

      {error === 'unavailable' && (
        // No RETRY: the rails answered, and asking again immediately gets the
        // same no. The way forward is the other way to sell — which is the
        // next tab along, not a different app.
        <AlertPanel
          title={SELL_COPY.unavailableTitle}
          body={SELL_COPY.unavailableBody}
          action={
            <Link href={sellHref('offer')} className={ALERT_ACTION_CLASS}>
              {SELL_COPY.unavailableAction}
            </Link>
          }
        />
      )}
      {error === 'failed' && (
        <AlertPanel
          title={SELL_COPY.failedTitle}
          body={SELL_COPY.failedBody}
          action={
            <button type="button" onClick={refetch} className={ALERT_ACTION_CLASS}>
              {SELL_COPY.retry}
            </button>
          }
        />
      )}

      {/* `currency !== null` rides the same gate the hook quotes under: an
          account whose country resolves to no currency gets no quote and so
          no quote UI — never a summary in a guessed currency. */}
      {amountValid && account !== null && currency !== null && error === null && (
        <>
          {quote !== null ? (
            <QuoteSummary
              quote={quote}
              expiresIn={expiresIn}
              currency={currency}
              assetSymbol={option?.symbol ?? ''}
              onRefresh={refetch}
            />
          ) : (
            loading && (
              <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-inset px-5 py-4">
                <Spinner />
                <p className="text-sm text-content-secondary">{SELL_COPY.quote.loading}</p>
              </div>
            )
          )}

          {/* A P2P cash-out is a Tenda escrow, so the platform fee applies —
              disclosed here so the quote never reads as entirely fee-free. */}
          {quote?.provider === P2P_PROVIDER_ID && option !== null && amountRaw !== null && (
            <FeeSummary variant="exchange" asset={option.assetId} principalRaw={amountRaw} />
          )}

          {quote !== null && (
            <div>
              <Button fullWidth disabled={submitting} onClick={() => void confirm()}>
                {SELL_COPY.confirm}
              </Button>
              <p className="mt-2.5 text-center text-xs leading-4 text-content-tertiary">
                {SELL_COPY.ctaNote('instant')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
