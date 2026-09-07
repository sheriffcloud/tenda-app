'use client'

/**
 * The "You sell" block shared by both sell tabs (web port of mobile's
 * SellAssetAmount): asset/chain picker first, then the amount — the reader
 * picks WHAT they are selling before saying how much of it.
 *
 * The comp's second chip row is fiat currencies to buy with. Ours is the
 * asset/chain being SOLD, because that is the choice this surface actually
 * has: the payout currency is derived from the payout account's country
 * (`payoutCurrencyForCountry`), not picked here — offering it would let a
 * reader choose a currency their account cannot receive.
 */
import { useAuthStore } from '@/stores/auth.store'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { Chip } from '@/components/ui/Chip'
import { SellWalletNotice } from './SellWalletNotice'
import { MoneyField } from './MoneyField'
import { chainLabel } from '@tenda/shared'
import type { ExchangeAssetOption } from '@/hooks/exchange/useExchangeAssetOptions'
import { assetOptionKey, type AssetSelection } from '@/hooks/wallet/useAssetSelection'
import { SELL_COPY } from './copy'

export function SellAssetAmount({
  selection,
  amount,
  onAmountChange,
  noWalletMessage,
}: {
  selection: AssetSelection
  amount: string
  onAmountChange: (next: string) => void
  /** Mode-specific line for the no-wallet case (mobile's prop, same name). */
  noWalletMessage: string
}) {
  const symbol = selection.option?.symbol ?? ''
  const retryWallets = useAuthStore((s) => s.refreshWallets)
  const retryChains = useChainRegistryStore((s) => s.fetch)

  return (
    <div>
      {/* Empty is not silence any more: it says WHICH of the four causes it is
          (#60). The amount field below STAYS — losing every option mid-session
          must not clear what the reader typed, which is this file's own tested
          rule and the same principle #60 is about. Mobile hides it instead;
          the divergence is deliberate and the value survives either way,
          because the amount is the parent's state, not the field's. */}
      <SellWalletNotice
        section={selection.section}
        noWalletMessage={noWalletMessage}
        onRetryWallets={() => void retryWallets()}
        onRetryChains={() => void retryChains()}
      />

      {/* Rendered even with ONE option (mobile's picker does the same): the
          chip is what states the "you sell X on Y" fact before the number. */}
      {selection.options.length > 0 && (
        <div>
          <p className="type-body-small font-semibold text-content-secondary">
            {SELL_COPY.assetLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={SELL_COPY.assetLabel}>
            {selection.options.map((option: ExchangeAssetOption) => (
              <Chip
                key={assetOptionKey(option)}
                label={`${option.symbol} · ${chainLabel(option.chainId)}`}
                selected={assetOptionKey(option) === selection.selectedKey}
                onClick={() => selection.select(option)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <MoneyField
          id="sell-amount"
          label={SELL_COPY.amountLabel}
          value={amount}
          onChange={onAmountChange}
          suffix={symbol}
        />
      </div>
    </div>
  )
}
