import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { formatAssetAmount } from '@tenda/shared'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ExpandableNotice } from '@/components/ui/information'
import { useIsSeeker } from '@/stores/auth.store'
import { useEscrowFee } from '@/hooks/useEscrowFee'

/** gig: poster escrows, worker is paid net. exchange: seller locks crypto, the buyer is paid net. */
type FeeVariant = 'gig' | 'exchange'

interface VariantCopy {
  escrowLabel: string
  netLabel: string
  note: (feePct: string) => string
}

const VARIANT_COPY: Record<FeeVariant, VariantCopy> = {
  gig: {
    escrowLabel: 'You escrow',
    netLabel: 'Worker receives',
    note: (pct) => `You escrow the full budget. The ${pct}% fee is taken from the worker's payout on completion.`,
  },
  exchange: {
    escrowLabel: 'You lock',
    netLabel: 'Buyer receives',
    note: (pct) => `You lock the full amount. The ${pct}% platform fee is taken from the buyer's crypto when the trade completes.`,
  },
}

interface FeeSummaryProps {
  /** Asset registry id, drives decimals + symbol (CO5). */
  asset: string
  /** Principal in raw base units of `asset` (string — BigInt-exact, no precision loss on 18-dp assets). */
  principalRaw: string
  /** gig (default) frames the fee from the poster/worker side; exchange from seller/buyer. */
  variant?: FeeVariant
  /** Optional eyebrow override; defaults to "PAYMENT BREAKDOWN". */
  eyebrow?: string
  /**
   * Fee tier of the escrow. Creation flows omit it (the creator's own Seeker
   * status is what gets baked in); read surfaces MUST pass the escrow's
   * snapshot so the projection matches what the contract will charge.
   */
  isSeeker?: boolean
}

/**
 * Platform-fee breakdown card for the create review step. The creator locks
 * exactly the principal; the platform fee is deducted from the COUNTERPARTY's
 * payout on settlement (contract `approve`: payout = amount − fee) — the worker
 * for a gig, the buyer for a P2P exchange. So this shows: locked principal /
 * platform fee / counterparty net — never principal + fee, which would
 * misrepresent the fee as the creator's own cost.
 */
export function FeeSummary({
  asset,
  principalRaw,
  variant = 'gig',
  eyebrow = 'PAYMENT BREAKDOWN',
  isSeeker,
}: FeeSummaryProps) {
  const { theme } = useUnistyles()
  const viewerIsSeeker = useIsSeeker()
  const { feeRaw, netRaw, feePct: feePctOrNull } = useEscrowFee(isSeeker ?? viewerIsSeeker, principalRaw)
  const feePct = feePctOrNull ?? '—'
  const copy = VARIANT_COPY[variant]

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
      <Eyebrow style={s.eyebrowSpacing}>{eyebrow}</Eyebrow>
      <View style={s.row}>
        <Text size={13.5} color={theme.colors.content.secondary}>{copy.escrowLabel}</Text>
        <Text style={[s.v, { color: theme.colors.content.primary }]}>
          {formatAssetAmount(principalRaw, asset)}
        </Text>
      </View>
      <View style={s.row}>
        <Text size={13.5} color={theme.colors.content.secondary}>
          {`Platform fee (${feePct}%)`}
        </Text>
        <Text style={[s.v, { color: theme.colors.content.secondary }]}>
          {feeRaw != null ? `− ${formatAssetAmount(feeRaw.toString(), asset)}` : '—'}
        </Text>
      </View>
      <View
        style={[
          s.row,
          s.totalRow,
          { borderTopColor: theme.colors.border.subtle },
        ]}
      >
        <Text size={13.5} weight="semibold" color={theme.colors.content.primary}>
          {copy.netLabel}
        </Text>
        <Text style={[s.vTotal, { color: theme.colors.content.primary }]}>
          {netRaw != null ? formatAssetAmount(netRaw.toString(), asset) : '—'}
        </Text>
      </View>
      <View style={s.note}>
        <ExpandableNotice
          content={{
            summary: 'How platform fees are paid.',
            title: 'How platform fees work',
            description: copy.note(feePct),
            tone: 'info',
          }}
        />
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  // Flush card — the parent owns horizontal placement so it drops into both
  // the gig form (20px gutters) and the sell flow (tab padding) cleanly.
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  eyebrowSpacing: { marginBottom: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 6,
  },
  v: {
    fontFamily: typography.fonts.mono,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.065,
  },
  totalRow: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  vTotal: {
    fontFamily: typography.fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.075,
  },
  note: {
    marginTop: 10,
    lineHeight: 16,
  },
})
