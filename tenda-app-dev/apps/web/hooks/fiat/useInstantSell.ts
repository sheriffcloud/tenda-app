'use client'

/**
 * Web port of apps/mobile/components/wallet/sell/useInstantSell.ts —
 * market-rate cash-out: a live offramp quote for the selected asset and payout
 * account, plus the confirm that initiates the intent.
 *
 * The rule that matters: a FRESH quote is required to submit. The quote
 * carries the `intent_id` the offramp acts against, so confirming on an
 * expired one would either fail at the rail or settle at a price the reader
 * was never shown — instead it re-quotes and says so.
 *
 * The offramp can answer with a P2P instruction rather than a rail intent
 * (no liquidity on the rail): that is not a failure, it is a different
 * destination, and it routes to the created offer instead of the intent page.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiClientError, CURRENCY_META, payoutCurrencyForCountry } from '@tenda/shared'
import type { BankAccountSummary } from '@tenda/shared'
import { api } from '@/api/client'
import { showToast } from '@/components/ui/Toast'
import { useFiatQuote } from '@/hooks/fiat/useFiatQuote'
import type { ExchangeAssetOption } from '@/hooks/exchange/useExchangeAssetOptions'

export const INSTANT_SELL_COPY = {
  restale: 'Fetching the latest price, try again in a moment',
  p2pFallback: 'Offer created, publish it to match with a buyer',
  failed: 'Could not start the cash-out',
} as const

export function useInstantSell({
  option,
  amountRaw,
  account,
}: {
  option: ExchangeAssetOption | null
  amountRaw: string | null
  account: BankAccountSummary | null
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  // `null` until a payout account is chosen — no default currency, because
  // under one-country-one-currency the account IS the answer (mobile's
  // useInstantSell carries the same rule; a quote priced in a guessed
  // currency is worse than no quote).
  const currency = payoutCurrencyForCountry(account?.country ?? null)
  const currencySymbol = currency === null ? '' : CURRENCY_META[currency].symbol
  const amountValid = amountRaw !== null && amountRaw !== '0' && amountRaw !== ''

  const { quote, expiresIn, loading, error, refetch } = useFiatQuote(
    option !== null && amountValid && account !== null && currency !== null
      ? {
          direction: 'offramp',
          asset: option.assetId,
          chainId: option.chainId,
          walletAddress: option.walletAddress,
          fiatCurrency: currency,
          assetAmountRaw: amountRaw ?? undefined,
        }
      : null,
  )

  async function confirm(): Promise<void> {
    if (option === null || account === null || amountRaw === null || submitting) return
    if (quote === null || expiresIn <= 0) {
      refetch()
      showToast('info', INSTANT_SELL_COPY.restale)
      return
    }
    setSubmitting(true)
    try {
      const result = await api.fiat.offramp({ intent_id: quote.intent_id, bank_account_id: account.id })
      const instruction = result.instruction
      if ('kind' in instruction && instruction.kind === 'p2p') {
        showToast('success', INSTANT_SELL_COPY.p2pFallback)
        router.replace(`/exchange/${instruction.offer_id}`)
        return
      }
      router.replace(`/wallet/intents/${result.intent_id}`)
    } catch (e) {
      showToast('error', e instanceof ApiClientError ? e.message : INSTANT_SELL_COPY.failed)
    } finally {
      setSubmitting(false)
    }
  }

  return { quote, expiresIn, loading, error, refetch, currency, currencySymbol, submitting, confirm }
}
