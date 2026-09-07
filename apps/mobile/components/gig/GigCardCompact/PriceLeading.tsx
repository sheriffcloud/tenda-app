import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Clock, Check, ArrowLeftRight } from 'lucide-react-native'
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
 * Variant A, Price-Leading (home.html `.card` proposal).
 * Two-column grid 86 / 1fr. Left strip carries the SOL amount + fiat alt;
 * right body carries category/status label, deadline chip, title, and location meta.
 */
export function GigCardCompactPriceLeading({ gig, showStatus = false }: Props) {
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
  const fiatAlt = price.fiat !== null ? `≈ ${formatFiat(price.fiat, currency)}` : ''
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
      <View
        style={[
          s.priceStrip,
          {
            backgroundColor: theme.colors.surface.backgroundAlt,
            borderRightColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Text style={[s.paysLabel, { color: theme.colors.content.tertiary }]}>
          PAYS
        </Text>
        <View>
          <View style={s.amountRow}>
            <Text style={[s.amount, { color: theme.colors.content.primary }]} numberOfLines={1}>
              {price.amount.toFixed(price.amount >= 1 ? 2 : 3)}
            </Text>
            <Text style={[s.unit, { color: theme.colors.content.tertiary }]}>{price.symbol}</Text>
          </View>
          {fiatAlt ? (
            <Text style={[s.fiat, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
              {fiatAlt}
            </Text>
          ) : null}
          <ChainBadge chainId={gig.chain_id} style={s.chain} />
        </View>
      </View>

      <View style={s.body}>
        <View style={s.topRow}>
          <View style={s.label}>
            <View
              style={[
                s.dot,
                { backgroundColor: showStatus ? statusDotColor : categoryColor.base },
              ]}
            />
            <Text
              style={[s.labelText, { color: theme.colors.content.secondary }]}
              numberOfLines={1}
            >
              {showStatus ? STATUS_LABEL[gig.status] : categoryLabel}
            </Text>
          </View>

          {deadlineMeta.label ? (
            <View
              style={[
                s.deadlineChip,
                {
                  backgroundColor: isUrgent
                    ? theme.colors.feedback.warning.surface
                    : isSuccess
                      ? theme.colors.feedback.success.surface
                      : theme.colors.surface.inset,
                },
              ]}
            >
              {deadlineMeta.glyph === 'check' ? (
                <Check size={10} color={theme.colors.feedback.success.base} strokeWidth={3} />
              ) : deadlineMeta.glyph === 'clock' ? (
                <Clock
                  size={10}
                  color={
                    isUrgent
                      ? theme.colors.feedback.warning.base
                      : theme.colors.content.secondary
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
                        : theme.colors.content.secondary,
                    fontWeight: isUrgent || isSuccess ? '600' : '500',
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

        <View style={s.meta}>
          {locationLabel ? (
            <Text
              style={[s.metaText, { color: theme.colors.content.tertiary }]}
              numberOfLines={1}
            >
              {locationLabel}
            </Text>
          ) : null}
          {gig.cross_border && (
            <>
              {locationLabel ? (
                <Text style={[s.metaSep, { color: theme.colors.content.tertiary }]}>·</Text>
              ) : null}
              <ArrowLeftRight size={11} color={theme.colors.feedback.warning.base} />
              <Text
                style={[s.metaText, { color: theme.colors.feedback.warning.base }]}
                numberOfLines={1}
              >
                Cross-border
              </Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 112,
  },
  pressed: { opacity: 0.96, transform: [{ scale: 0.995 }] },
  priceStrip: {
    width: 86,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  paysLabel: {
    fontFamily: typography.fonts.mono,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  amount: {
    fontFamily: typography.fonts.mono,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  unit: {
    fontFamily: typography.fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  fiat: {
    fontFamily: typography.fonts.mono,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.105,
    marginTop: 4,
  },
  chain: { marginTop: 6 },
  body: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'column',
    gap: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 22 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  labelText: {
    fontFamily: typography.fonts.mono,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  deadlineChip: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    flexShrink: 0,
  },
  deadlineText: { fontSize: 11, lineHeight: 14, letterSpacing: -0.11 },
  title: { fontSize: 15, lineHeight: 19.5, fontWeight: '600', letterSpacing: -0.15 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12.5, lineHeight: 16, flexShrink: 1 },
  metaSep: { fontSize: 12.5, lineHeight: 16, opacity: 0.5 },
})
