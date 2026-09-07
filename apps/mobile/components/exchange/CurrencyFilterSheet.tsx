import { Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Check } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { Text, BottomSheet } from '@/components/ui'
import { SUPPORTED_CURRENCIES } from '@tenda/shared'

/** Bottom-sheet currency filter for the exchange market. Tap a selected row to clear. */
export function CurrencyFilterSheet({
  visible,
  onClose,
  currency,
  onSelect,
}: {
  visible: boolean
  onClose: () => void
  currency: string | null
  onSelect: (cur: string) => void
}) {
  const { theme } = useUnistyles()
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filter by currency">
      {SUPPORTED_CURRENCIES.map((cur) => (
        <Pressable
          key={cur}
          onPress={() => onSelect(cur)}
          style={[s.option, { borderBottomColor: theme.colors.border.subtle }]}
        >
          <Text
            weight={currency === cur ? 'semibold' : 'regular'}
            color={currency === cur ? theme.colors.brand.primary : theme.colors.content.primary}
          >
            {cur}
          </Text>
          {currency === cur && <Check size={16} color={theme.colors.brand.primary} />}
        </Pressable>
      ))}
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
})
