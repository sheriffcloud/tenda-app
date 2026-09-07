import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { ChevronRight } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { Spacer } from '@/components/ui/Spacer'
import { ExchangeStatusBadge } from './ExchangeStatusBadge'
import { chainLabel, formatAssetAmount } from '@tenda/shared'
import type { EscrowListRow } from '@tenda/shared'

/**
 * Own-trade row: EscrowListRow lacks the joined market fields, so it renders
 * the lean amount + status shape. `side` distinguishes offers the user posted
 * (selling) from offers they accepted (buying) — both live in this one list.
 */
export function MyOfferRow({ offer, side }: { offer: EscrowListRow; side: 'selling' | 'buying' }) {
  const router = useRouter()
  const { theme } = useUnistyles()
  const sideColor = side === 'selling' ? theme.colors.brand.primary : theme.colors.accent.primary
  return (
    <Pressable
      onPress={() => router.push(`/exchange/${offer.id}` as never)}
      style={({ pressed }) => [
        s.row,
        { borderBottomColor: theme.colors.border.subtle },
        pressed && { opacity: 0.96 },
      ]}
    >
      <View style={s.body}>
        <View style={s.headline}>
          <Text
            variant="caption"
            weight="bold"
            color={sideColor}
            style={s.sideTag}
          >
            {side === 'selling' ? 'SELLING' : 'BUYING'}
          </Text>
          <Text weight="semibold" numberOfLines={1} style={s.amount}>
            {formatAssetAmount(offer.amount_raw, offer.asset)}
            {offer.fiat_currency ? ` → ${offer.fiat_currency}` : ''}
          </Text>
        </View>
        <Spacer size={6} />
        <View style={s.metaRow}>
          <ExchangeStatusBadge status={offer.status} />
          <Text variant="caption" color={theme.colors.content.tertiary}>
            {chainLabel(offer.chain_id)}
          </Text>
        </View>
      </View>
      <ChevronRight size={20} color={theme.colors.content.tertiary} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
  },
  body: { flex: 1, minWidth: 0 },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sideTag: { letterSpacing: 0.5, flexShrink: 0 },
  amount: { flexShrink: 1, minWidth: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
