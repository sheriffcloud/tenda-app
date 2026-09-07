import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import { Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'
import type { ChainOption } from './useGigForm'

/**
 * Network (chain) selector, CO5. Gigs are USDC-denominated on every chain,
 * so this only picks where the escrow lives. Renders null when there's a
 * single eligible chain (no choice to make).
 */
export function NetworkPicker({
  options,
  selected,
  onSelect,
  assetSymbol,
}: {
  options: ChainOption[]
  selected: string
  onSelect: (id: string) => void
  assetSymbol: string
}) {
  const { theme } = useUnistyles()
  if (options.length <= 1) return null

  return (
    <>
      <SectionLabel tight>Network</SectionLabel>
      <Text style={[s.hint, { color: theme.colors.content.tertiary }]}>
        Where the escrow lives. Workers are paid in {assetSymbol} on this network.
      </Text>
      <View style={s.chipRow}>
        {options.map((opt) => (
          <Chip
            key={opt.id}
            label={opt.enabled ? opt.label : `${opt.label} (link a wallet)`}
            variant="form"
            selected={selected === opt.id}
            disabled={!opt.enabled}
            onPress={() => opt.enabled && onSelect(opt.id)}
          />
        ))}
      </View>
    </>
  )
}

const s = StyleSheet.create({
  hint: { fontSize: 12.5, lineHeight: 17, paddingHorizontal: 20, paddingBottom: 8, marginTop: -4 },
  chipRow: { paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
