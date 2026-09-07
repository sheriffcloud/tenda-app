import { View, StyleSheet } from 'react-native'
import type { ReactNode } from 'react'
import { useUnistyles } from 'react-native-unistyles'
import { radius, typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { DeadlineCountdown } from '@/components/shared'
import { formatFiat, formatPaymentWindow } from '@/lib/currency'
import { chainLabel } from '@/lib/chains'
import { formatDate } from '@/lib/gig-display'
import { useEscrowFee } from '@/hooks/useEscrowFee'
import { ASSET_META, computeRelevantDeadline, formatAssetAmount } from '@tenda/shared'
import type { ExchangeDetail, SupportedCurrency, EscrowStatus } from '@tenda/shared'

/**
 * Status-aware label for the single live-deadline row. Deliberately DISTINCT
 * from the gig wording (which reads "Deliver by" / "Review by"): a P2P buyer
 * ACCEPTS, then PAYS within the window, then the seller CONFIRMS receipt. The
 * urgency verb ("Pay in", not "Pay by") pairs with the ticking H:MM:SS clock.
 * Statuses with no live deadline are omitted (computeRelevantDeadline → null).
 */
const DEADLINE_LABEL: Partial<Record<EscrowStatus, string>> = {
  open: 'Accept in',
  accepted: 'Pay in',
  submitted: 'Confirm in',
}

interface TermRow {
  label: string
  /** Static text value, or a live node (the deadline countdown). */
  value: string | ReactNode
  /** Bolder value styling for the row the reader is really here for. */
  emphasis?: boolean
}

/**
 * Terms card for the exchange detail screen: rate, network, payment window,
 * the buyer's true net (amount − platform fee, the figure the taker actually
 * receives — the headline gross alone misstates the trade), and the live
 * stage deadline.
 */
export function ExchangeTermsCard({ offer }: { offer: ExchangeDetail }) {
  const { theme } = useUnistyles()
  const rate = formatFiat(Number(offer.rate), offer.fiat_currency as SupportedCurrency)
  const symbol = ASSET_META[offer.asset]?.symbol ?? offer.asset

  // Projection of the contract's settlement math for THIS escrow's fee tier.
  const { feeRaw, netRaw, feePct } = useEscrowFee(offer.is_seeker, offer.amount_raw)

  const rows: TermRow[] = [
    { label: 'Rate', value: `${rate} / ${symbol}` },
    { label: 'Network', value: chainLabel(offer.chain_id) },
    { label: 'Payment window', value: formatPaymentWindow(offer.payment_window_seconds) },
    {
      label: `Platform fee${feePct !== null ? ` (${feePct}%)` : ''}`,
      value: feeRaw !== null ? `− ${formatAssetAmount(feeRaw.toString(), offer.asset)}` : '—',
    },
    {
      label: 'Buyer receives',
      value: netRaw !== null ? formatAssetAmount(netRaw.toString(), offer.asset) : '—',
      emphasis: true,
    },
  ]
  if (offer.created_at !== null) {
    rows.push({ label: 'Listed', value: formatDate(offer.created_at) })
  }

  // The concrete "by when" for the current stage — a LIVE ticking clock, the
  // gap the old card had: it only ever showed the static window duration.
  const deadlineRowLabel = DEADLINE_LABEL[offer.status]
  const deadline = computeRelevantDeadline(offer)
  if (deadlineRowLabel !== undefined && deadline !== null) {
    rows.push({
      label: deadlineRowLabel,
      value: <DeadlineCountdown deadline={deadline} size="inline" />,
    })
  }

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
      ]}
    >
      {rows.map((row, i) => (
        <View key={row.label}>
          {i > 0 && <View style={[s.divider, { backgroundColor: theme.colors.border.subtle }]} />}
          <View style={s.row}>
            <Text style={[s.label, { color: theme.colors.content.secondary }]}>{row.label}</Text>
            {typeof row.value === 'string' ? (
              <Text
                style={[
                  s.value,
                  row.emphasis === true && s.valueEmphasis,
                  { color: theme.colors.content.primary },
                ]}
              >
                {row.value}
              </Text>
            ) : (
              row.value
            )}
          </View>
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    height: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontSize: 13, lineHeight: 18 },
  value: {
    fontFamily: typography.fonts.mono,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  valueEmphasis: {
    fontSize: 15,
    fontWeight: '700',
  },
  divider: { height: 1 },
})
