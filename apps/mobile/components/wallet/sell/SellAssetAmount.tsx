import { SectionLabel } from '@/components/ui/SectionLabel'
import { Input } from '@/components/ui/Input'
import { AssetChainPicker } from '@/components/exchange/AssetChainPicker'
import { useAuthStore } from '@/stores/auth.store'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { SellWalletNotice } from './SellWalletNotice'
import type { AssetSelection } from './useAssetSelection'

/**
 * The "You sell" block shared by both sell tabs: asset/chain picker + crypto
 * amount. With nothing tradable it collapses to SellWalletNotice, which says
 * WHICH of the four causes it is (#60) — it used to claim "link a wallet" for
 * all of them, including while the wallets and chains were still loading.
 */
export function SellAssetAmount({
  selection,
  amount,
  onAmountChange,
  noWalletMessage,
}: {
  selection: AssetSelection
  amount: string
  onAmountChange: (next: string) => void
  noWalletMessage: string
}) {
  const { options, option, selectedKey, select, section } = selection
  // `retryWalletSync`, not `refreshMe`: the store names this exact case —
  // "re-run the wallets[] load after it failed" — and the retry below only
  // appears in the state it was written for (walletsStatus === 'error').
  const retryWallets = useAuthStore((st) => st.retryWalletSync)
  const retryChains = useChainRegistryStore((st) => st.ensureLoaded)

  if (options.length === 0) {
    return (
      <SellWalletNotice
        section={section}
        noWalletMessage={noWalletMessage}
        onRetryWallets={() => void retryWallets()}
        onRetryChains={() => void retryChains()}
      />
    )
  }

  return (
    <>
      <SectionLabel>You sell</SectionLabel>
      <AssetChainPicker options={options} selectedKey={selectedKey} onSelect={select} />
      <SectionLabel>Amount</SectionLabel>
      <Input
        label={`Amount${option !== null ? ` (${option.symbol})` : ''}`}
        placeholder="2.5"
        value={amount}
        onChangeText={onAmountChange}
        keyboardType="numeric"
      />
    </>
  )
}
