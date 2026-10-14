import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Check } from 'lucide-react-native'
import { Text } from '@/components/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SUPPORTED_CURRENCIES, CURRENCY_META } from '@tenda/shared'
import type { SupportedCurrency } from '@tenda/shared'

/** Display-currency picker sheet. */
export function CurrencySheet({
  visible,
  onClose,
  currency,
  onSelect,
}: {
  visible: boolean
  onClose: () => void
  currency: SupportedCurrency
  onSelect: (c: SupportedCurrency) => void
}) {
  const { theme } = useUnistyles()
  return (
    <BottomSheet title="Display currency" visible={visible} onClose={onClose}>
      {SUPPORTED_CURRENCIES.map((c) => {
        const meta = CURRENCY_META[c]
        const selected = currency === c
        return (
          <Pressable
            key={c}
            onPress={() => onSelect(c)}
            style={({ pressed }) => [s.ccyRow, pressed && { backgroundColor: theme.colors.surface.pressed }]}
          >
            <View style={[s.ccyFlag, { backgroundColor: theme.colors.surface.inset }]}>
              <Text style={s.ccyFlagText}>{meta.flag}</Text>
            </View>
            <View style={s.ccyMeta}>
              <Text style={[s.ccyCode, { color: theme.colors.content.primary }]}>
                {c} <Text style={{ color: theme.colors.content.tertiary, fontWeight: '400' }}>· {meta.symbol}</Text>
              </Text>
              <Text style={[s.ccyName, { color: theme.colors.content.tertiary }]}>{meta.name}</Text>
            </View>
            {selected && (
              <View style={[s.checkPill, { backgroundColor: theme.colors.brand.solid }]}>
                <Check size={13} color={theme.colors.brand.onPrimary} strokeWidth={3} />
              </View>
            )}
          </Pressable>
        )
      })}
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  ccyRow: { height: 52, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ccyFlag: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ccyFlagText: { fontSize: 18, includeFontPadding: false },
  ccyMeta: { flex: 1, minWidth: 0 },
  ccyCode: { fontSize: 15, fontWeight: '600', letterSpacing: -0.15 },
  ccyName: { fontSize: 12.5, marginTop: 1 },
  checkPill: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
})
