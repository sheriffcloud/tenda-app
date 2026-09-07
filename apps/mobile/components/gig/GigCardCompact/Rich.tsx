import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Clock, Check } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { CATEGORY_META } from '@/lib/categories'
import { toAssetPaymentDisplay, formatFiat } from '@/lib/currency'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useSettingsStore } from '@/stores/settings.store'
import { LOCATIONS, type CountryCode , GigSummary } from '@tenda/shared'
import { gigDeadlineMeta } from '@/lib/gig-display'
import { ChainBadge } from '@/components/escrow/ChainBadge'
import { STATUS_DOT_COLOR, STATUS_LABEL } from './shared'

interface Props {
  gig: GigSummary
  showStatus?: boolean
}

/**
 * Variant C, Rich Compact (home.html `.card-rich`, shipped in the rendered list preview).
 * Vertical stack: top row (cat/status + deadline), title, 2-line excerpt, foot row
 * with location + remote-pill + price + fiat alt. Densest of the variants, surfaces
 * the gig's description preview alongside price and meta.
 */
export function GigCardCompactRich({ gig, showStatus = false }: Props) {
  const router = useRouter()
  const { theme } = useUnistyles()
  const rates = useExchangeRateStore((s) => s.rates)
  const currency = useSettingsStore((s) => s.currency)

  const categoryColor = theme.colors.category[gig.category]
  const categoryLabel =
    CATEGORY_META.find((c) => c.key === gig.category)?.label ?? gig.category
  const rate = rates?.[currency] ?? null
  const price = toAssetPaymentDisplay(gig.amount_raw, gig.asset, rate)

  const deadlineMeta = gigDeadlineMeta(gig)
  const isUrgent = deadlineMeta.tone === 'urgent'
  const isSuccess = deadlineMeta.tone === 'success'

  const statusDotColor = STATUS_DOT_COLOR(theme, gig.status)
  const fiatAlt = price.fiat !== null ? formatFiat(price.fiat, currency) : ''
  const flag = LOCATIONS[gig.country as CountryCode]?.flag ?? ''
  const locationLabel = gig.remote ? `Remote${flag ? ` · ${flag}` : ''}` : gig.city ?? ''

  return (
    <Pressable
      onPress={() => router.push(`/gig/${gig.escrow_id}`)}
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: theme.colors.surface.card,
          borderColor: theme.colors.border.default,
        },
        pressed && s.pressed,
      ]}
    >
      <View style={s.top}>
        <View
          style={[
            s.dot,
            { backgroundColor: showStatus ? statusDotColor : categoryColor.base },
          ]}
        />
        <Text
          style={[s.label, { color: theme.colors.content.secondary }]}
          numberOfLines={1}
        >
          {showStatus ? STATUS_LABEL[gig.status] : categoryLabel}
        </Text>
        <View style={s.spacer} />
        {deadlineMeta.label ? (
          <View style={s.deadline}>
            {deadlineMeta.glyph === 'check' ? (
              <Check size={10} color={theme.colors.feedback.success.base} strokeWidth={3} />
            ) : deadlineMeta.glyph === 'clock' ? (
              <Clock
                size={10}
                color={
                  isUrgent
                    ? theme.colors.feedback.warning.base
                    : theme.colors.content.tertiary
                }
              />
            ) : null}
            <Text
              style={[
                s.deadlineText,
                {
                  color: isUrgent
                    ? theme.colors.feedback.warning.base
                    : isSuccess
                      ? theme.colors.feedback.success.base
                      : theme.colors.content.tertiary,
                  fontWeight: isUrgent || isSuccess ? '600' : '400',
                },
              ]}
              numberOfLines={1}
            >
              {deadlineMeta.label}
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={[s.title, { color: theme.colors.content.primary }]}
        numberOfLines={1}
      >
        {gig.title}
      </Text>

      <Text
        style={[s.excerpt, { color: theme.colors.content.secondary }]}
        numberOfLines={2}
      >
        {gig.description}
      </Text>

      <View style={[s.foot, { borderTopColor: theme.colors.border.subtle }]}>
        <View style={s.metaRow}>
          {locationLabel ? (
            <Text
              style={[s.loc, { color: theme.colors.content.secondary }]}
              numberOfLines={1}
            >
              {locationLabel}
            </Text>
          ) : null}
          {locationLabel ? (
            <Text style={[s.sep, { color: theme.colors.border.default }]}>·</Text>
          ) : null}
          <View
            style={[
              s.remotePill,
              {
                backgroundColor: gig.remote
                  ? theme.colors.brand.primarySurface
                  : theme.colors.surface.backgroundAlt,
              },
            ]}
          >
            <Text
              style={[
                s.remotePillText,
                {
                  color: gig.remote
                    ? theme.colors.brand.primary
                    : theme.colors.content.secondary,
                },
              ]}
            >
              {gig.remote ? 'Remote' : 'On-site'}
            </Text>
          </View>
        </View>

        <ChainBadge chainId={gig.chain_id} />

        <Text
          style={[s.price, { color: theme.colors.content.primary }]}
          numberOfLines={1}
        >
          {`${price.amount.toFixed(price.amount >= 1 ? 2 : 3)} ${price.symbol}`}
          {fiatAlt ? (
            <Text style={[s.priceFiat, { color: theme.colors.content.tertiary }]}>
              {' '}
              {fiatAlt}
            </Text>
          ) : null}
        </Text>
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'column',
    gap: 10,
  },
  pressed: { opacity: 0.96, transform: [{ scale: 0.995 }] },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  label: {
    fontFamily: typography.fonts.mono,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  spacer: { flex: 1 },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  deadlineText: {
    fontFamily: typography.fonts.mono,
    fontSize: 10.5,
    lineHeight: 14,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: -0.18,
  },
  excerpt: { fontSize: 12, lineHeight: 16 },
  foot: {
    marginTop: 2,
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loc: { fontSize: 12.5, lineHeight: 16, fontWeight: '600', flexShrink: 1 },
  sep: { fontSize: 12.5, lineHeight: 16 },
  remotePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    flexShrink: 0,
  },
  remotePillText: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  price: {
    fontFamily: typography.fonts.mono,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: -0.18,
  },
  priceFiat: {
    fontFamily: typography.fonts.mono,
    fontSize: 12,
    fontWeight: '500',
  },
})
