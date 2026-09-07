import { View, StyleSheet } from 'react-native'
import { Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'

/** A stable key for an option (assetId is unique per chain, but pair to be safe). */
export function optionKey(o: Pick<ExchangeAssetOption, 'chainId' | 'assetId'>): string {
  return `${o.chainId}:${o.assetId}`
}

/**
 * Asset + chain selector for the sell flow: one chip per tradable (asset, chain)
 * pair the user holds a wallet for. Always shows the selected asset (a single
 * option renders as one selected chip, so "what you're selling" is never a
 * mystery); the caller shows NoLinkedWalletNotice when there are none.
 * Presentational — options + selection come from the hook.
 */
export function AssetChainPicker({
  options,
  selectedKey,
  onSelect,
}: {
  options: ExchangeAssetOption[]
  selectedKey: string
  onSelect: (option: ExchangeAssetOption) => void
}) {
  if (options.length === 0) return null
  return (
    <View>
      <SectionLabel>Asset</SectionLabel>
      <View style={s.chipRow}>
        {options.map((o) => (
          <Chip
            key={optionKey(o)}
            label={`${o.symbol} · ${o.chainName}`}
            variant="form"
            selected={selectedKey === optionKey(o)}
            onPress={() => onSelect(o)}
          />
        ))}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
