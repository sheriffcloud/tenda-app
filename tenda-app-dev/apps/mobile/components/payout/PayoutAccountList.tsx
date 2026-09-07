import { View, StyleSheet, Pressable } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Landmark, Smartphone } from 'lucide-react-native'
import type { BankAccountSummary } from '@tenda/shared'
import { Text } from '@/components/ui'

interface Props {
  accounts: BankAccountSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * Selectable list of saved payout accounts (radio semantics), used inside the
 * PayoutAccountSelect dropdown sheet. Purely presentational — empty/add
 * affordances belong to the dropdown, and deletion to PayoutAccountRow.
 */
export function PayoutAccountList({ accounts, selectedId, onSelect }: Props) {
  const { theme } = useUnistyles()
  return (
    <View style={s.list}>
      {accounts.map((a) => {
        const Icon = a.kind === 'mobile_money' ? Smartphone : Landmark
        const selected = selectedId === a.id
        return (
          <Pressable
            key={a.id}
            onPress={() => onSelect(a.id)}
            style={[
              s.row,
              {
                backgroundColor: theme.colors.surface.card,
                borderColor: selected ? theme.colors.brand.primary : theme.colors.border.default,
              },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Icon size={16} color={theme.colors.content.secondary} />
            <View style={s.body}>
              <Text size={13.5} weight="semibold">{a.account_name}</Text>
              <Text size={12} color={theme.colors.content.tertiary}>
                {a.bank_code} · {a.account_number_masked}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  body: { flex: 1, gap: 2 },
})
