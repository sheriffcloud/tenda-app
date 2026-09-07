import { useState } from 'react'
import { useRouter } from 'expo-router'
import { payoutCurrencyForCountry, CURRENCY_META } from '@tenda/shared'
import type { BankAccountSummary } from '@tenda/shared'
import { api, ApiClientError } from '@/api/client'
import { showToast } from '@/components/ui'
import { useFiatQuote } from '@/hooks/useFiatQuote'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'

/**
 * Instant (market-rate) cash-out: a live offramp quote for the selected asset +
 * account, and confirm() which initiates the offramp intent. A FRESH quote is
 * required to submit — the quote carries the intent the offramp acts against.
 */
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

  const currency = payoutCurrencyForCountry(account?.country ?? null)
  const currencySymbol = CURRENCY_META[currency].symbol
  const amountValid = amountRaw !== null && amountRaw !== '0'

  const { quote, expiresIn, loading, error, refetch } = useFiatQuote(
    option !== null && amountValid && account !== null
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

  async function confirm() {
    if (option === null || account === null || amountRaw === null || submitting) return
    if (quote === null || expiresIn <= 0) {
      refetch()
      showToast('info', 'Fetching the latest price, try again in a moment')
      return
    }
    setSubmitting(true)
    try {
      const result = await api.fiat.offramp({ intent_id: quote.intent_id, bank_account_id: account.id })
      const inst = result.instruction
      if ('kind' in inst && inst.kind === 'p2p') {
        showToast('success', 'Offer created, publish it to match with a buyer')
        router.replace(`/exchange/${inst.offer_id}` as Parameters<typeof router.replace>[0])
        return
      }
      router.replace({ pathname: '/wallet/intents/[id]', params: { id: result.intent_id } })
    } catch (e) {
      showToast('error', e instanceof ApiClientError ? e.message : 'Could not start the cash-out')
    } finally {
      setSubmitting(false)
    }
  }

  return { quote, expiresIn, loading, error, refetch, currency, currencySymbol, submitting, confirm }
}
