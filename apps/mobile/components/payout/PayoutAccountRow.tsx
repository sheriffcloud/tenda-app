import { View, StyleSheet, Pressable } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Landmark, Smartphone, Trash2 } from 'lucide-react-native'
import type { BankAccountSummary } from '@tenda/shared'
import { Text } from '@/components/ui'

/** One saved payout account; the icon reflects the rail (bank vs mobile money). */
export function PayoutAccountRow({
  account,
  onDelete,
}: {
  account: BankAccountSummary
  onDelete: (account: BankAccountSummary) => void
}) {
  const { theme } = useUnistyles()
  const Icon = account.kind === 'mobile_money' ? Smartphone : Landmark
  return (
    <View style={[s.row, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
      <Icon size={18} color={theme.colors.content.secondary} />
      <View style={s.body}>
        <Text size={14} weight="semibold">{account.account_name}</Text>
        <Text size={12} color={theme.colors.content.tertiary}>
          {account.bank_code} · {account.account_number_masked}
          {account.is_default ? ' · Default' : ''}
          {account.verified ? ' · Verified' : ''}
        </Text>
      </View>
      <Pressable
        onPress={() => onDelete(account)}
        hitSlop={8}
        accessibilityLabel="Remove payout account"
        accessibilityRole="button"
      >
        <Trash2 size={16} color={theme.colors.feedback.danger.base} />
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  body: { flex: 1, gap: 2 },
})
