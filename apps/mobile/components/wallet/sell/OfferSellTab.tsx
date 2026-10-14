import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import {
  DEFAULT_ACCEPT_WINDOW_SECONDS,
  EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS,
  getOfferMissingRequirement,
  parseUnits,
  payoutCurrencyForCountry,
  SECONDS_PER_HOUR,
  SELL_NO_WALLET_OFFER,
} from '@tenda/shared'
import { Text, Button, Spacer } from '@/components/ui'
import { Input } from '@/components/ui/Input'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { FeeSummary } from '@/components/shared/FeeSummary'
import { FormSubmitBar } from '@/components/form/FormSubmitBar'
import { usePayoutAccounts } from '@/hooks/usePayoutAccounts'
import { spacing } from '@/theme/tokens'
import { useAssetSelection } from './useAssetSelection'
import { useOfferSell } from './useOfferSell'
import { SellAssetAmount } from './SellAssetAmount'
import { SellPayoutSection } from './SellPayoutSection'
import { OfferDeadlines } from './OfferDeadlines'
import { OfferReviewCard } from './OfferReviewCard'
import { tabBodyStyle } from './shared'

// Must resolve to an hours value present in ACCEPT_DEADLINE_OPTIONS, else the
// tab opens with no accept chip selected (7d/168h is currently in the set).
const DEFAULT_ACCEPT_HOURS = DEFAULT_ACCEPT_WINDOW_SECONDS / SECONDS_PER_HOUR

/** Create offer: crypto out → fiat at YOUR rate (a P2P sell offer on the book). */
export function OfferSellTab() {
  const { theme } = useUnistyles()
  const selection = useAssetSelection()
  const payout = usePayoutAccounts()

  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [acceptHours, setAcceptHours] = useState(DEFAULT_ACCEPT_HOURS)
  const [paymentWindowSeconds, setPaymentWindowSeconds] = useState(EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS)

  const { submitting, submit } = useOfferSell()

  const option = selection.option
  const account = payout.selected
  // `null` until a payout account is chosen. There is no default: the account's
  // country is the only thing that knows the currency, so the rate label reads
  // generically and both the submit and the review card wait for it.
  const currency = payoutCurrencyForCountry(account?.country ?? null)

  const rateNum = Number(rate)
  const amountRaw = option !== null ? parseUnits(amount, option.decimals) : null
  const fiatTotal = Math.floor(Number(amount) * rateNum * 100) / 100
  const missingRequirement = getOfferMissingRequirement({
    hasAsset: option !== null,
    amountRaw,
    rate: rateNum,
    fiatTotal,
    // An account whose country resolves to no currency is not a usable payout
    // account — it happens when a market is retired while someone still has an
    // account saved for it. Folding it in here keeps the CTA disabled with the
    // existing reason; leaving it out enabled a button whose handler returned
    // silently, which is the one outcome worse than a disabled one.
    hasPayoutAccount: account !== null && currency !== null,
  })
  const valid = missingRequirement === null

  function handleSubmit() {
    if (!valid || option === null || amountRaw === null || account === null || currency === null) return
    void submit({ option, amountRaw, account, fiatTotal, currency, rate: rateNum, acceptHours, paymentWindowSeconds })
  }

  const symbol = option?.symbol ?? ''
  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={tabBodyStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.intro}>
          <Text variant="heading">Create your offer</Text>
          <Text variant="body" color={theme.colors.content.secondary}>
            Set the amount and your preferred exchange rate. Your crypto stays protected in escrow.
          </Text>
        </View>
        <SellAssetAmount
          selection={selection}
          amount={amount}
          onAmountChange={setAmount}
          noWalletMessage={SELL_NO_WALLET_OFFER}
        />

        {selection.options.length > 0 && (
          <>
            <SectionLabel>Your rate</SectionLabel>
            <Input
              label={currency !== null ? `${currency} per ${symbol || 'unit'}` : `Rate per ${symbol || 'unit'}`}
              placeholder="150000"
              value={rate}
              onChangeText={setRate}
              keyboardType="numeric"
            />

            <OfferDeadlines
              acceptHours={acceptHours}
              onAcceptChange={setAcceptHours}
              paymentWindowSeconds={paymentWindowSeconds}
              onPaymentWindowChange={setPaymentWindowSeconds}
            />

            <SellPayoutSection payout={payout} />

            {valid && option !== null && amountRaw !== null && account !== null && currency !== null && (
              <>
                <SectionLabel>Review your offer</SectionLabel>
                <OfferReviewCard
                  amountRaw={amountRaw}
                  assetId={option.assetId}
                  fiatTotal={fiatTotal}
                  currency={currency}
                  rate={rateNum}
                  assetSymbol={option.symbol}
                  payoutLabel={`${account.bank_code} · ${account.account_number_masked}`}
                />
                <FeeSummary variant="exchange" asset={option.assetId} principalRaw={amountRaw} />
              </>
            )}

            <Spacer size={spacing.xl} />
          </>
        )}
      </ScrollView>
      {selection.options.length > 0 ? (
        <FormSubmitBar hint={valid ? null : `${missingRequirement} to post your offer`}>
          <Button variant="primary" size="lg" fullWidth loading={submitting} disabled={!valid} onPress={handleSubmit}>
            Post offer
          </Button>
        </FormSubmitBar>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  // The tab body already pads by spacing.md; extra padding here would indent
  // the intro 36px while inputs and cards below sit at 16px.
  intro: { gap: spacing.xs },
})
