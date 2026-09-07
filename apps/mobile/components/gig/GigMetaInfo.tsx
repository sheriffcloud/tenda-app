import { View, StyleSheet } from 'react-native'
import { MapPin, Clock, Calendar, Globe } from 'lucide-react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { formatDuration } from '@/lib/gig-display'
import { formatFiat } from '@/lib/currency'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useEscrowFee } from '@/hooks/useEscrowFee'
import { LOCATIONS, ASSET_META, amountRawToDisplay } from '@tenda/shared'
import type { GigDetail, CountryCode, SupportedCurrency, EscrowStatus } from '@tenda/shared'
import type { LucideIcon } from 'lucide-react-native'

/**
 * Status-specific label for the single deadline row. The value itself comes
 * from computeRelevantDeadline upstream, which already picks the right
 * underlying deadline per status; this just names it so we never show both a
 * stale "Accept by" and a generic "Deadline". Statuses with no live deadline
 * are omitted (computeRelevantDeadline returns null → no row).
 */
const DEADLINE_LABEL: Partial<Record<EscrowStatus, string>> = {
  open: 'Accept by',
  accepted: 'Deliver by',
  submitted: 'Review by',
}

interface Props {
  gig: Pick<
    GigDetail,
    | 'city' | 'country' | 'remote'
    | 'completion_duration_seconds'
    | 'amount_raw' | 'asset' | 'status' | 'is_seeker'
  >
  deadlineLbl: string | null
}

interface Row {
  Icon: LucideIcon
  label: string
  value: string
  iconTint?: string
}

export function GigMetaInfo({ gig, deadlineLbl }: Props) {
  const { theme } = useUnistyles()
  const rates = useExchangeRateStore((s) => s.rates)
  const currency = useSettingsStore((s) => s.currency) as SupportedCurrency
  const rate = rates?.[currency] ?? null

  const assetMeta = ASSET_META[gig.asset]
  const amount = amountRawToDisplay(gig.amount_raw, gig.asset)
  const symbol = assetMeta?.symbol ?? gig.asset

  // The platform rate cache is SOL-denominated, a fiat equivalent is only
  // meaningful for native-SOL gigs. Stable assets read as ≈ face value.
  const isSolAsset = symbol === 'SOL'
  const fiatAlt =
    isSolAsset && rate !== null && rate > 0 ? `≈ ${formatFiat(amount * rate, currency)}` : null

  // Worker net-of-fee: the platform fee is deducted from the payout on
  // completion, so the worker actually receives amount − fee. Fee tier is the
  // one baked into the escrow (gig.is_seeker), mirroring the contract.
  const { netRaw, feePct: feePctLabel } = useEscrowFee(gig.is_seeker, gig.amount_raw)
  const workerNet = netRaw != null ? amountRawToDisplay(netRaw.toString(), gig.asset) : null

  // Escrow is funded once the gig leaves draft (the create tx confirming is
  // what flips draft → open).
  const escrowFunded = gig.status !== 'draft'

  const rows: Row[] = []

  if (gig.completion_duration_seconds !== null) {
    rows.push({
      Icon: Calendar,
      label: 'Deliver within',
      value: formatDuration(gig.completion_duration_seconds),
    })
  }

  // Remote gigs carry no location (country/city are null); physical gigs always
  // have both. So: "Remote" or the work location, "City, Country".
  const workCountry = gig.country ? (LOCATIONS[gig.country as CountryCode]?.name ?? gig.country) : null
  rows.push({
    Icon: gig.remote ? Globe : MapPin,
    label: 'Location',
    value: gig.remote ? 'Remote' : ([gig.city, workCountry].filter(Boolean).join(', ') || '—'),
    iconTint: gig.remote ? theme.colors.brand.primary : undefined,
  })

  // One status-aware deadline row (open → "Accept by", accepted → "Deliver by",
  // submitted → "Review by"); replaces the old duplicate "Accept by" + generic
  // "Deadline" pair, which showed the same moment on open and a stale accept
  // deadline once the gig moved on.
  const deadlineRowLabel = DEADLINE_LABEL[gig.status]
  if (deadlineLbl && deadlineRowLabel) {
    rows.push({
      Icon: Clock,
      label: deadlineRowLabel,
      value: deadlineLbl,
    })
  }

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: theme.colors.surface.card,
          borderColor: theme.colors.border.default,
        },
      ]}
    >
      {/* Payment header */}
      <View style={s.top}>
        <View style={s.payCol}>
          <Text style={[s.payLabel, { color: theme.colors.content.tertiary }]}>
            PAYMENT
          </Text>
          <View style={s.payValue}>
            <Text style={[s.payAmount, { color: theme.colors.content.primary }]}>
              {amount.toLocaleString('en-US', { maximumFractionDigits: amount >= 1 ? 2 : 4 })}
            </Text>
            <Text style={[s.payUnit, { color: theme.colors.content.secondary }]}>
              {symbol}
            </Text>
          </View>
          {fiatAlt && (
            <Text style={[s.payFiat, { color: theme.colors.content.tertiary }]}>
              {fiatAlt}
            </Text>
          )}
          {workerNet != null && (
            <Text style={[s.payNet, { color: theme.colors.content.tertiary }]}>
              Worker gets {workerNet.toLocaleString('en-US', { maximumFractionDigits: workerNet >= 1 ? 2 : 4 })} {symbol} · after {feePctLabel}% fee
            </Text>
          )}
        </View>

        {escrowFunded && (
          <View style={[s.escrow, { backgroundColor: theme.colors.feedback.success.surface }]}>
            <View style={[s.escrowDot, { backgroundColor: theme.colors.feedback.success.base }]} />
            <Text style={[s.escrowLabel, { color: theme.colors.feedback.success.base }]}>
              ESCROW READY
            </Text>
          </View>
        )}
      </View>

      <View style={[s.divider, { backgroundColor: theme.colors.border.subtle }]} />

      {/* Meta rows */}
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1
        return (
          <View
            key={`${row.label}-${i}`}
            style={[
              s.row,
              !isLast && {
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border.subtle,
              },
            ]}
          >
            <View style={s.iconWrap}>
              <row.Icon size={14} color={row.iconTint ?? theme.colors.content.tertiary} />
            </View>
            <Text style={[s.rowLabel, { color: theme.colors.content.secondary }]} numberOfLines={1}>
              {row.label}
            </Text>
            <Text
              style={[s.rowValue, { color: theme.colors.content.primary }]}
              numberOfLines={1}
            >
              {row.value}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  top: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  payCol: {
    flex: 1,
    minWidth: 0,
  },
  payLabel: {
    fontFamily: typography.fonts.mono,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 1.0,
  },
  payValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 4,
  },
  payAmount: {
    fontFamily: typography.fonts.mono,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.22,
  },
  payUnit: {
    fontFamily: typography.fonts.mono,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  payFiat: {
    fontFamily: typography.fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  payNet: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  escrow: {
    flexShrink: 0,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  escrowDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  escrowLabel: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.05,
  },
  divider: {
    height: 1,
  },
  row: {
    height: 40,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconWrap: {
    width: 16,
    alignItems: 'center',
    flexShrink: 0,
  },
  rowLabel: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  rowValue: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.135,
    textAlign: 'right',
    flexShrink: 1,
  },
})
