import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { MapPin, Clock, Globe, ArrowLeftRight } from 'lucide-react-native'
import { spacing, radius, typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { MoneyText } from '@/components/ui/MoneyText'
import { GigStatusBadge } from '../GigStatusBadge'
import { ChainBadge } from '@/components/escrow/ChainBadge'
import { AgentBadge } from '@/components/ui/AgentBadge'
import { CATEGORY_META, toAssetPaymentDisplay, LOCATIONS, type CountryCode, GigSummary, gigDeadlineMeta } from '@tenda/shared'
import { gigCardAmountDigits } from './amount'
import { CATEGORY_DOT_COLOR } from './shared'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useSettingsStore } from '@/stores/settings.store'

interface Props {
  gig: GigSummary
  showStatus?: boolean
}

/**
 * Variant, Classic (pre-V2 anatomy, kept for revertibility).
 * Vertical stack: category dot + label + chain/status badges, title (2-line),
 * MoneyText (fiat ≈ sol horizontal), footer meta. Visually different from wireframe variant B `.card-classic` (which is a
 * horizontal row); the name follows the wireframe taxonomy convention without claiming
 * 1:1 fidelity to its specific anatomy.
 */
export function GigCardCompactClassic({ gig, showStatus = false }: Props) {
  const router = useRouter()
  const { theme } = useUnistyles()
  const rates = useExchangeRateStore((s) => s.rates)
  const currency = useSettingsStore((s) => s.currency)
  const categoryDot = CATEGORY_DOT_COLOR(theme, gig.category)
  const categoryLabel =
    CATEGORY_META.find((c) => c.key === gig.category)?.label ?? gig.category
  const price = toAssetPaymentDisplay(gig.amount_raw, gig.asset, rates, currency)
  const deadlineMeta = gigDeadlineMeta(gig)
  // No success arm — see the NO SUCCESS CHIP note in ./shared for why a card
  // never renders `gigDeadlineMeta`'s completed/resolved tone.

  return (
    <Pressable
      onPress={() => router.push(`/gig/${gig.escrow_id}`)}
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: theme.colors.surface.card,
          borderColor: theme.colors.border.subtle,
        },
        pressed && s.pressed,
      ]}
    >
      <View style={s.categoryRow}>
        <View style={s.category}>
          <View style={[s.categoryDot, { backgroundColor: categoryDot }]} />
          <Text variant="caption" color={theme.colors.content.secondary} numberOfLines={1} style={s.categoryLabel}>
            {categoryLabel}
          </Text>
        </View>

        <View style={s.rowBadges}>
          <ChainBadge chainId={gig.chain_id} />
          {gig.creator.is_agent && <AgentBadge />}
          {showStatus && <GigStatusBadge status={gig.status} />}
        </View>
      </View>

      <Text variant="subheading" numberOfLines={2} style={s.title}>
        {gig.title}
      </Text>

      <MoneyText fiat={price.fiat} currency={currency} amountLabel={`${gigCardAmountDigits(price.amount)} ${price.symbol}`} size={typography.styles.body.fontSize} />

      <View style={s.footer}>
        <View style={s.metaItem}>
          {gig.remote
            ? <Globe size={14} color={theme.colors.brand.primary} />
            : <MapPin size={14} color={theme.colors.content.tertiary} />}
          <Text
            variant="caption"
            color={gig.remote ? theme.colors.brand.primary : theme.colors.content.secondary}
          >
            {gig.remote
              ? `Remote · ${LOCATIONS[gig.country as CountryCode]?.flag ?? ''}`
              : gig.city}
          </Text>
        </View>
        {gig.cross_border && (
          <View style={s.metaItem}>
            <ArrowLeftRight size={14} color={theme.colors.feedback.warning.base} />
            <Text variant="caption" color={theme.colors.feedback.warning.base}>Cross-border</Text>
          </View>
        )}
        {deadlineMeta.label ? (
          <View style={s.metaItem}>
            {/* Two arms, and the null one is load-bearing: `gigDeadlineMeta`
                returns `glyph: null` to mean NO icon (cancelled is the live
                case), and an unguarded clock drew one for it. The 'check'
                glyph pairs with the success tone, which a card never renders
                — see the NO SUCCESS CHIP note in ./shared. */}
            {deadlineMeta.glyph === 'clock' ? (
              <Clock
                size={14}
                color={
                  deadlineMeta.tone === 'urgent'
                    ? theme.colors.feedback.warning.base
                    : theme.colors.content.tertiary
                }
              />
            ) : null}
            <Text
              variant="caption"
              color={
                deadlineMeta.tone === 'urgent'
                  ? theme.colors.feedback.warning.base
                  : theme.colors.content.secondary
              }
            >
              {deadlineMeta.label}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  // Wraps for the same measured reason as the other two variants: the chain
  // joined this row, and category + chain + status badge do not fit a card row
  // at a 320px device. The badge pair drops to its own right-aligned line
  // rather than squeezing the category label away.
  categoryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 6 },
  category: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  // In RN a flex child defaults to `flexShrink: 0`, so `numberOfLines` on the
  // label needs this to be able to elide rather than push the row.
  categoryLabel: { flexShrink: 1 },
  rowBadges: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  title: { marginTop: spacing.sm, marginBottom: spacing.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
})
