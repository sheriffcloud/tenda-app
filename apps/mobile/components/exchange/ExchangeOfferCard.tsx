import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { ChevronRight, Clock } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { Avatar } from '@/components/ui/Avatar'
import { ExchangeStatusBadge } from './ExchangeStatusBadge'
import { formatFiat } from '@/lib/currency'
import { chainLabel } from '@/lib/chains'
import { formatDurationShort } from '@/lib/countdown'
import { formatAssetAmount, ASSET_META, formatFullName } from '@tenda/shared'
import type { ExchangeSummary, SupportedCurrency } from '@tenda/shared'

interface Props {
  offer: ExchangeSummary
  showStatus?: boolean
}

export function ExchangeOfferCard({ offer, showStatus = false }: Props) {
  const router = useRouter()
  const { theme } = useUnistyles()

  // numeric(20,4)/(30,10) arrive as strings, display-only conversion.
  const fiat = formatFiat(Number(offer.fiat_amount), offer.fiat_currency as SupportedCurrency)
  const rate = formatFiat(Number(offer.rate), offer.fiat_currency as SupportedCurrency)
  const symbol = ASSET_META[offer.asset]?.symbol ?? offer.asset
  // 'Seller' kept verbatim: it is user-visible copy, and whether this surface
  // should say Seller / Maker / Anonymous is a product call, not a refactor.
  const sellerName =
    formatFullName(offer.creator.first_name, offer.creator.last_name) || 'Seller'
  // `.trim()` before the truthiness test, for the same reason sellerName uses
  // formatFullName: a first_name of '  ' is truthy, so this rendered the string
  // '@  ' — a visible at-sign with nothing after it, and a separator dot after
  // that. Not covered by formatFullName because this is one name, not a join.
  const first = offer.creator.first_name?.trim()
  const handle = first ? `@${first.toLowerCase()}` : null
  // numeric(3,2), string on the wire, null when unrated.
  const score = offer.creator.review_score === null ? null : Number(offer.creator.review_score)

  return (
    <Pressable
      onPress={() => router.push(`/exchange/${offer.escrow_id}`)}
      style={({ pressed }) => [
        s.row,
        { borderBottomColor: theme.colors.border.subtle },
        pressed && s.pressed,
      ]}
    >
      <Avatar src={offer.creator.avatar_url} name={sellerName} size="md" />

      <View style={s.body}>
        {/* Row 1, seller identity + network */}
        <View style={s.row1}>
          <Text
            style={[s.seller, { color: theme.colors.content.primary }]}
            numberOfLines={1}
          >
            {sellerName}
          </Text>
          <View style={[s.netPill, { backgroundColor: theme.colors.surface.inset }]}>
            <Text style={[s.netText, { color: theme.colors.content.secondary }]} numberOfLines={1}>
              {chainLabel(offer.chain_id)}
            </Text>
          </View>
        </View>

        {/* Row 2, the trade: asset → fiat */}
        <View style={s.tradeRow}>
          <Text style={[s.sol, { color: theme.colors.content.primary }]} numberOfLines={1}>
            {formatAssetAmount(offer.amount_raw, offer.asset)}
          </Text>
          <Text style={[s.arrow, { color: theme.colors.content.tertiary }]}>→</Text>
          <Text style={[s.fiat, { color: theme.colors.content.primary }]} numberOfLines={1}>
            {fiat}
          </Text>
        </View>

        {/* Row 3, handle · ★ rating · rate/asset · window */}
        <View style={s.metaRow}>
          {handle && (
            <Text style={[s.metaText, { color: theme.colors.content.tertiary }]}>{handle}</Text>
          )}
          {score != null && handle && (
            <Text style={[s.metaSep, { color: theme.colors.content.tertiary }]}>·</Text>
          )}
          {score != null && (
            <Text style={[s.metaText, { color: theme.colors.content.tertiary }]}>
              <Text style={{ color: theme.colors.accent.primary }}>★ </Text>
              {score.toFixed(1)}
            </Text>
          )}
          <Text style={[s.metaSep, { color: theme.colors.content.tertiary }]}>·</Text>
          <Text style={[s.metaText, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
            {rate}/{symbol}
          </Text>
        </View>

        {/* Row 4, payment window + optional status */}
        <View style={s.footerRow}>
          <Clock size={12} color={theme.colors.content.tertiary} />
          <Text style={[s.metaText, { color: theme.colors.content.tertiary }]}>
            Pay within {formatDurationShort(offer.payment_window_seconds)}
          </Text>
          {showStatus && (
            <View style={s.statusWrap}>
              <ExchangeStatusBadge status={offer.status} />
            </View>
          )}
        </View>
      </View>

      <ChevronRight size={20} color={theme.colors.content.tertiary} style={s.chev} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  pressed: { opacity: 0.96 },
  body: {
    flex: 1,
    minWidth: 0,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seller: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  netPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  netText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  sol: {
    fontFamily: typography.fonts.mono,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.16,
    flexShrink: 0,
  },
  arrow: {
    fontFamily: typography.fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 0,
  },
  fiat: {
    fontFamily: typography.fonts.mono,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12.5,
    lineHeight: 16,
  },
  metaSep: {
    fontSize: 12.5,
    lineHeight: 16,
    opacity: 0.5,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  statusWrap: {
    marginLeft: 4,
  },
  chev: {
    alignSelf: 'center',
  },
})
