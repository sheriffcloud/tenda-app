import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Clock } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { CATEGORY_META, toAssetPaymentDisplay, formatFiat, LOCATIONS, type CountryCode, GigSummary, gigDeadlineMeta } from '@tenda/shared'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useSettingsStore } from '@/stores/settings.store'
import { ChainBadge } from '@/components/escrow/ChainBadge'
import { AgentBadge } from '@/components/ui/AgentBadge'
import { gigCardAmountDigits } from './amount'
import { CATEGORY_DOT_COLOR, STATUS_DOT_COLOR, STATUS_LABEL } from './shared'

interface Props {
  gig: GigSummary
  showStatus?: boolean
}

/**
 * Variant C, Rich Compact (home.html `.card-rich`, shipped in the rendered list preview).
 * Vertical stack: top row (cat/status + chain + deadline), title, 2-line excerpt,
 * foot row with location + remote-pill + price + fiat alt. The chain reads on the
 * top row beside the category rather than down in the foot: which chain a gig
 * pays on decides whether the reader holds a wallet that can take it, and this
 * is the card the public feed actually renders. Densest of the variants, surfaces
 * the gig's description preview alongside price and meta.
 */
export function GigCardCompactRich({ gig, showStatus = false }: Props) {
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
        <View style={s.category}>
          <View
            style={[
              s.dot,
              { backgroundColor: showStatus ? statusDotColor : categoryDot },
            ]}
          />
          <Text
            style={[s.label, { color: theme.colors.content.secondary }]}
            numberOfLines={1}
          >
            {showStatus ? STATUS_LABEL[gig.status] : categoryLabel}
          </Text>
        </View>

        <View style={s.rowBadges}>
          <ChainBadge chainId={gig.chain_id} />
          {gig.creator.is_agent && <AgentBadge />}
          {deadlineMeta.label ? (
            <View style={s.deadline}>
              {deadlineMeta.glyph === 'clock' ? (
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
                      : theme.colors.content.tertiary,
                    fontWeight: isUrgent ? '600' : '400',
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

        <Text
          style={[s.price, { color: theme.colors.content.primary }]}
          numberOfLines={1}
        >
          {`${gigCardAmountDigits(price.amount)} ${price.symbol}`}
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
  // Wraps, because the chain joined this row. Measured at a 320px device: the
  // feed pads 20 and the card pads 16, leaving 248px — and category + chain +
  // deadline together want ~245px, which is no margin at all once a testnet
  // name ('Solana Devnet') or a long deadline ('12 days left') shows up. The
  // badge pair drops to its own right-aligned line instead of squeezing the
  // category away; short labels ('BASE', '4h left') still share one line.
  top: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 6 },
  // Dot and label travel together so a wrap can never strand the dot alone.
  category: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  // Chain and deadline likewise; `marginLeft: 'auto'` right-aligns the pair on
  // whichever line it ends up on. It replaces the old `spacer` flex child,
  // which cannot right-align anything once the row is allowed to wrap.
  rowBadges: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  label: {
    fontFamily: typography.fonts.mono.bold,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    // Pairs with `minWidth: 0` on `category`: in RN a flex child defaults to
    // `flexShrink: 0`, so `numberOfLines` above has nothing to act on and the
    // label would push the row instead of eliding.
    flexShrink: 1,
  },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  deadlineText: {
    fontFamily: typography.fonts.mono.regular,
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
    fontFamily: typography.fonts.mono.bold,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: -0.18,
  },
  priceFiat: {
    fontFamily: typography.fonts.mono.medium,
    fontSize: 12,
    fontWeight: '500',
  },
})
