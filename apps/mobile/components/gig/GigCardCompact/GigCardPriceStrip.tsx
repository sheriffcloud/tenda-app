/**
 * The card's left money column — "PAYS", the amount, its symbol and the fiat
 * alt — for the price-leading variant.
 *
 * Its own component because the strip is the one part of that card with real
 * geometry to get right, and the rules below only make sense together: a FIXED
 * 86px width, 10px of padding either side, and therefore 66px of content for
 * an amount whose length the poster chooses.
 */
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'

export function GigCardPriceStrip({
  amount,
  symbol,
  fiatAlt,
}: {
  /** Already formatted for display — the strip decides layout, not precision. */
  amount: string
  symbol: string
  /** The "≈ ₦…" line, or empty when this cache cannot price the asset. */
  fiatAlt: string
}) {
  const { theme } = useUnistyles()

  return (
    <View
      style={[
        s.priceStrip,
        {
          backgroundColor: theme.colors.surface.backgroundAlt,
          borderRightColor: theme.colors.border.subtle,
        },
      ]}
    >
      <Text style={[s.paysLabel, { color: theme.colors.content.tertiary }]}>PAYS</Text>
      <View style={s.priceBlock}>
        <Text
          style={[s.amount, { color: theme.colors.content.primary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {amount}
        </Text>
        <Text style={[s.unit, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
          {symbol}
        </Text>
        {fiatAlt ? (
          <Text style={[s.fiat, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
            {fiatAlt}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
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
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
  },
  // `alignSelf: 'stretch'` is the load-bearing rule, not tidiness. `priceStrip`
  // is a column with `alignItems: 'flex-start'`, so without it this block is
  // sized to its own max-content width and simply paints past the 86px strip —
  // `numberOfLines` and font auto-sizing have no box to fit INTO. Stretching
  // hands it the strip's real content width (86 - 2x10 = 66px), which is what
  // every rule below measures against, and it is also what gives both Texts
  // their own 66px so neither needs a shrink rule.
  priceBlock: { alignSelf: 'stretch' },
  amount: {
    fontFamily: typography.fonts.mono.bold,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  // The symbol sits UNDER the digits rather than beside them. The strip holds
  // 66px and JetBrains Mono is a fixed 0.6em advance, so at the amount's 20px
  // with -0.4 letterSpacing every character costs exactly 11.6px:
  //     '50.00'    5 chars   58.0px   fits at full size
  //     '1462.00'  7 chars   81.2px   needs 0.81 scale
  //     '14620.00' 8 chars   92.8px   needs 0.71 scale
  // Side by side the symbol added another ~26px on top of all three, which
  // elided the asset on ordinary gigs and not just large ones. Stacked, the
  // digits get the whole 66px: five characters at full size, and up to eight
  // by shrinking within the 0.7 floor above. Anything longer ellipsises rather
  // than painting outside the card, because `numberOfLines` still applies once
  // auto-sizing bottoms out.
  //
  // The symbol needs no shrink rule of its own: the block is a stretched
  // column, so this Text is already 66px wide and its `numberOfLines` truncates
  // there. Four characters is the longest real symbol ('USDC', 'cUSD', 'CELO')
  // at 6.6px each, but `toAssetPaymentDisplay` falls back to the raw asset key
  // for an unknown asset ('USDC_DEVNET'), which is why that matters.
  unit: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  fiat: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.105,
    marginTop: 4,
  },
})
