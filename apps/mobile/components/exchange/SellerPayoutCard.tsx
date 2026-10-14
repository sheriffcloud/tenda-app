import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Landmark, Smartphone } from 'lucide-react-native'
import { radius, typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import type { ExchangeDetail, ExchangePayoutAccount, EscrowStatus } from '@tenda/shared'

/** Statuses where the bound account still matters to the seller. */
const SELLER_PAYOUT_STATUSES: readonly EscrowStatus[] = ['draft', 'open', 'accepted', 'submitted']

/**
 * Seller-side counterpart of shouldShowPaymentInstructions: the creator sees
 * which of their accounts the buyer's fiat lands in (the buyer sees the same
 * account through PaymentInstructionsCard instead — never both at once).
 */
export function shouldShowSellerPayout(
  offer: Pick<ExchangeDetail, 'creator' | 'payout_account' | 'status'>,
  userId: string,
): boolean {
  return (
    userId === offer.creator.id &&
    offer.payout_account !== null &&
    SELLER_PAYOUT_STATUSES.includes(offer.status)
  )
}

/**
 * The payout account bound to the offer, shown to its SELLER. Before this
 * card the creator had no way to check which account they attached — the
 * detail screen only ever revealed it to the accepted buyer.
 */
export function SellerPayoutCard({ account }: { account: ExchangePayoutAccount }) {
  const { theme } = useUnistyles()
  const isMomo = account.kind === 'mobile_money'
  const Icon = isMomo ? Smartphone : Landmark

  return (
    <View style={[s.card, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
      <View style={s.head}>
        <Icon size={16} color={theme.colors.content.secondary} />
        <Text style={[s.title, { color: theme.colors.content.primary }]}>You receive payment into</Text>
      </View>
      <Text style={[s.name, { color: theme.colors.content.primary }]} numberOfLines={1}>
        {account.account_name}
      </Text>
      <Text style={[s.detail, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
        {account.bank_code} · {account.account_number}
      </Text>
      <Text style={[s.note, { color: theme.colors.content.tertiary }]}>
        The matched buyer is instructed to pay into this account only.
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontSize: 13.5, lineHeight: 18, fontWeight: '600' },
  name: { fontSize: 14.5, lineHeight: 19, fontWeight: '600', marginTop: 8 },
  detail: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 12.5,
    lineHeight: 16,
    marginTop: 2,
  },
  note: { fontSize: 11.5, lineHeight: 15, marginTop: 8 },
})
