import { SectionLabel } from '@/components/ui/SectionLabel'
import { Input } from '@/components/ui/Input'
import { AssetChainPicker } from '@/components/exchange/AssetChainPicker'
import { NoLinkedWalletNotice } from '@/components/wallet/NoLinkedWalletNotice'
import type { AssetSelection } from './useAssetSelection'

/**
 * The "You sell" block shared by both sell tabs: asset/chain picker + crypto
 * amount. When the user has no verified wallet for any tradable chain it
 * collapses to NoLinkedWalletNotice (actionable link), replacing the old dead
 * "Connect a wallet" caption.
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
  const { options, option, selectedKey, select } = selection

  if (options.length === 0) {
    return <NoLinkedWalletNotice message={noWalletMessage} />
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
