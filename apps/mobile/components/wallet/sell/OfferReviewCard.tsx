import { StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ArrowDown } from 'lucide-react-native'
import { formatAssetAmount } from '@tenda/shared'
import { radius, spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { ReviewRow } from '@/components/shared/ReviewRow'

interface Props {
  amountRaw: string
  assetId: string
  fiatTotal: number
  currencySymbol: string
  rate: number
  assetSymbol: string
  payoutLabel: string
}

export function OfferReviewCard(props: Props) {
  const { theme } = useUnistyles()
  const fiat = `${props.currencySymbol}${props.fiatTotal.toLocaleString('en-US')}`

  return (
    <View style={[s.card, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
      <Text variant="caption" color={theme.colors.content.tertiary}>OFFER PREVIEW</Text>
      <Text variant="heading" style={s.amount}>{formatAssetAmount(props.amountRaw, props.assetId)}</Text>
      <View style={[s.arrow, { backgroundColor: theme.colors.brand.primarySurface }]}>
        <ArrowDown size={16} color={theme.colors.brand.primary} />
      </View>
      <Text variant="heading" color={theme.colors.brand.primary}>{fiat}</Text>
      <View style={[s.divider, { backgroundColor: theme.colors.border.subtle }]} />
      <View style={s.rows}>
        <ReviewRow label="Your rate" value={`${props.currencySymbol}${props.rate.toLocaleString('en-US')} / ${props.assetSymbol}`} />
        <ReviewRow label="Payout to" value={props.payoutLabel} />
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  // No outer margin: the host container owns horizontal padding, and the
  // card must line up with the FeeSummary rendered directly below it.
  card: { borderRadius: radius.card, borderWidth: 1, padding: spacing.lg, alignItems: 'center' },
  amount: { marginTop: spacing.sm },
  arrow: { width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xs },
  divider: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  rows: { alignSelf: 'stretch', marginTop: spacing.xs, gap: spacing.xs },
})
