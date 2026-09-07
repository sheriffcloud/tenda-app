import { useState } from 'react'
import { ScrollView } from 'react-native'
import { parseUnits, P2P_PROVIDER_ID } from '@tenda/shared'
import { Button } from '@/components/ui'
import { FeeSummary } from '@/components/shared/FeeSummary'
import { usePayoutAccounts } from '@/hooks/usePayoutAccounts'
import { useAssetSelection } from './useAssetSelection'
import { useInstantSell } from './useInstantSell'
import { SellAssetAmount } from './SellAssetAmount'
import { SellPayoutSection } from './SellPayoutSection'
import { QuoteSummary, QuoteLoading, QuoteError, UnavailableNotice, tabBodyStyle } from './shared'

/** Instant cash-out: crypto out → fiat at the live market rate (auto-quote). */
export function InstantSellTab() {
  const selection = useAssetSelection()
  const payout = usePayoutAccounts()
  const [amount, setAmount] = useState('')

  const option = selection.option
  const amountRaw = option !== null ? parseUnits(amount, option.decimals) : null
  const amountValid = amountRaw !== null && amountRaw !== '0'
  const account = payout.selected

  const { quote, expiresIn, loading, error, refetch, currencySymbol, submitting, confirm } = useInstantSell({
    option,
    amountRaw,
    account,
  })

  return (
    <ScrollView contentContainerStyle={tabBodyStyle} keyboardShouldPersistTaps="handled">
      <SellAssetAmount
        selection={selection}
        amount={amount}
        onAmountChange={setAmount}
        noWalletMessage="Link a wallet to cash out crypto."
      />

      {selection.options.length > 0 && (
        <>
          <SellPayoutSection payout={payout} />

          {error === 'unavailable' && (
            <UnavailableNotice copy="No cash-out route is available for this amount right now, please try again later." />
          )}
          {error === 'failed' && <QuoteError onRetry={refetch} />}

          {amountValid && account !== null && error === null && (
            <>
              {quote !== null && (
                <QuoteSummary
                  rate={quote.rate}
                  fee={quote.fee_amount}
                  fiatAmount={quote.fiat_amount}
                  currencySymbol={currencySymbol}
                  assetSymbol={option?.symbol ?? ''}
                  expiresIn={expiresIn}
                  onRefresh={refetch}
                />
              )}
              {quote === null && loading && <QuoteLoading />}
              {/* P2P cash-out is a Tenda escrow — disclose the platform fee so
                  the quote never reads as entirely fee-free. */}
              {quote?.provider === P2P_PROVIDER_ID && option !== null && amountRaw !== null && (
                <FeeSummary variant="exchange" asset={option.assetId} principalRaw={amountRaw} />
              )}
              {quote !== null && (
                <Button variant="primary" size="lg" fullWidth loading={submitting} onPress={() => void confirm()}>
                  Confirm cash-out
                </Button>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  )
}
