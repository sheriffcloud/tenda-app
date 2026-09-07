import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { MapPin, Clock, Check, Globe, ArrowLeftRight } from 'lucide-react-native'
import { spacing, radius, typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { MoneyText } from '@/components/ui/MoneyText'
import { GigStatusBadge } from '../GigStatusBadge'
import { ChainBadge } from '@/components/escrow/ChainBadge'
import { CATEGORY_META } from '@/lib/categories'
import { toAssetPaymentDisplay } from '@/lib/currency'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useSettingsStore } from '@/stores/settings.store'
import { LOCATIONS, type CountryCode , GigSummary } from '@tenda/shared'
import { gigDeadlineMeta } from '@/lib/gig-display'

interface Props {
  gig: GigSummary
  showStatus?: boolean
}

/**
 * Variant, Classic (pre-V2 anatomy, kept for revertibility).
 * Vertical stack: category dot + label, title (2-line), MoneyText (fiat ≈ sol horizontal),
 * footer meta. Visually different from wireframe variant B `.card-classic` (which is a
 * horizontal row); the name follows the wireframe taxonomy convention without claiming
 * 1:1 fidelity to its specific anatomy.
 */
export function GigCardCompactClassic({ gig, showStatus = false }: Props) {
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
        <View style={[s.categoryDot, { backgroundColor: categoryColor.base }]} />
        <Text variant="caption" color={theme.colors.content.secondary}>
          {categoryLabel}
        </Text>
        {showStatus && <GigStatusBadge status={gig.status} />}
      </View>

      <Text variant="subheading" numberOfLines={2} style={s.title}>
        {gig.title}
      </Text>

      <MoneyText fiat={price.fiat} currency={currency} amountLabel={`${price.amount.toFixed(price.amount >= 1 ? 2 : 3)} ${price.symbol}`} size={typography.styles.body.fontSize} />

      <ChainBadge chainId={gig.chain_id} style={s.chain} />

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
            {deadlineMeta.glyph === 'check' ? (
              <Check size={14} color={theme.colors.feedback.success.base} strokeWidth={2.5} />
            ) : (
              <Clock
                size={14}
                color={
                  deadlineMeta.tone === 'urgent'
                    ? theme.colors.feedback.warning.base
                    : theme.colors.content.tertiary
                }
              />
            )}
            <Text
              variant="caption"
              color={
                deadlineMeta.tone === 'urgent'
                  ? theme.colors.feedback.warning.base
                  : deadlineMeta.tone === 'success'
                    ? theme.colors.feedback.success.base
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
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  title: { marginTop: spacing.sm, marginBottom: spacing.xs },
  chain: { marginTop: spacing.xs },
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
