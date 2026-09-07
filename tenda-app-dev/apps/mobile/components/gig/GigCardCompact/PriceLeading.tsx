import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Clock, ArrowLeftRight } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { CATEGORY_META, toAssetPaymentDisplay, formatFiat, LOCATIONS, type CountryCode, GigSummary, gigDeadlineMeta } from '@tenda/shared'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useSettingsStore } from '@/stores/settings.store'
import { ChainBadge } from '@/components/escrow/ChainBadge'
import { AgentBadge } from '@/components/ui/AgentBadge'
import { GigCardPriceStrip } from './GigCardPriceStrip'
import { gigCardAmountDigits } from './amount'
import { CATEGORY_DOT_COLOR, STATUS_DOT_COLOR, STATUS_LABEL } from './shared'

interface Props {
  gig: GigSummary
  showStatus?: boolean
}

/**
 * Variant A, Price-Leading (home.html `.card` proposal).
 * Two-column grid 86 / 1fr. Left strip carries the amount, its symbol and the
 * fiat alt, stacked; right body carries category/status label, the settlement
 * chain, deadline chip, title, and location meta.
 *
 * The chain sits on the category row rather than under the money because which
 * chain a gig pays on decides whether the reader holds a wallet that can take
 * it — the same reason it reads beside the category on web.
 */
export function GigCardCompactPriceLeading({ gig, showStatus = false }: Props) {
  const router = useRouter()
  const { theme } = useUnistyles()
  const rates = useExchangeRateStore((s) => s.rates)
  const currency = useSettingsStore((s) => s.currency)

  const categoryDot = CATEGORY_DOT_COLOR(theme, gig.category)
  const categoryLabel =
    CATEGORY_META.find((c) => c.key === gig.category)?.label ?? gig.category
  const price = toAssetPaymentDisplay(gig.amount_raw, gig.asset, rates, currency)

  const deadlineMeta = gigDeadlineMeta(gig)
  const isUrgent = deadlineMeta.tone === 'urgent'
  // No success arm — see the NO SUCCESS CHIP note in ./shared for why a card
  // never renders `gigDeadlineMeta`'s completed/resolved tone.

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
      <GigCardPriceStrip
        amount={gigCardAmountDigits(price.amount)}
        symbol={price.symbol}
        fiatAlt={fiatAlt}
      />

      <View style={s.body}>
        <View style={s.topRow}>
          <View style={s.label}>
            <View
              style={[
                s.dot,
                { backgroundColor: showStatus ? statusDotColor : categoryDot },
              ]}
            />
            <Text
              style={[s.labelText, { color: theme.colors.content.secondary }]}
              numberOfLines={1}
            >
              {showStatus ? STATUS_LABEL[gig.status] : categoryLabel}
            </Text>
          </View>

          <View style={s.rowBadges}>
            <ChainBadge chainId={gig.chain_id} />
            {gig.creator.is_agent && <AgentBadge />}
            {deadlineMeta.label ? (
              <View
                style={[
                  s.deadlineChip,
                  {
                    backgroundColor: isUrgent
                      ? theme.colors.feedback.warning.surface
                      : theme.colors.surface.inset,
                  },
                ]}
              >
                {deadlineMeta.glyph === 'clock' ? (
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
                        : theme.colors.content.secondary,
                      fontWeight: isUrgent ? '600' : '500',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {deadlineMeta.label}
                </Text>
              </View>
            ) : null}
          </View>
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
  body: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'column',
    gap: 6,
  },
  // `flexWrap` is load-bearing since the chain joined this row, and the width
  // is MEASURED: at a 320px device the list pads 16, the price strip takes a
  // fixed 86 and the body pads 14, leaving this row 174px — where the label,
  // the chain and the deadline together want ~245px. They do not fit, and
  // without the wrap the category squeezed away. Wrapping drops the badge pair
  // onto its own right-aligned line and every label stays whole. `minHeight`
  // rather than the old fixed `height: 22`, or the second line has nowhere to
  // go. Testnet chain names are the long ones ('Solana Devnet'); production
  // reads 'Solana', 'BASE'.
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 6,
    minHeight: 22,
  },
  // Chain and deadline move as one unit so the wrap never splits them across
  // two lines, and `marginLeft: 'auto'` right-aligns the pair on whichever
  // line it lands on.
  rowBadges: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  label: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  labelText: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  deadlineChip: {
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
