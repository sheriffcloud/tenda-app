import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatAmountOrUnknown } from '@tenda/shared'

/**
 * Wallet balance hero, the USDC-first total across every linked wallet/chain
 * (gigs settle in USDC on all chains, so it's one summable unit). Per-chain
 * breakdown + the Sell / cash-out action live below it (WalletBalanceRows /
 * WalletActions). Display-only; the screen owns the data + actions.
 */
export function WalletHeroCard({
  totalUsdc,
  isLoading,
}: {
  /** null when this build has no metadata for the balance's asset — see
   *  `amountRawToDisplay`. A total we cannot scale is not a total. */
  totalUsdc: number | null
  isLoading: boolean
}) {
  const { theme } = useUnistyles()

  return (
    <View
      style={[
        s.hero,
        { backgroundColor: theme.colors.brand.primarySurface, borderColor: theme.colors.brand.primaryBorder },
      ]}
    >
      <Text style={[s.label, { color: theme.colors.content.tertiary }]}>TOTAL BALANCE</Text>

      <View style={s.balanceRow}>
        {isLoading ? (
          <Skeleton width={160} height={42} />
        ) : (
          <>
            <Text style={[s.amount, { color: theme.colors.content.primary }]}>
              {formatAmountOrUnknown(totalUsdc, (v) =>
                v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              )}
            </Text>
            <Text style={[s.unit, { color: theme.colors.content.tertiary }]}>USDC</Text>
          </>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  hero: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  label: { fontFamily: typography.fonts.mono.semibold, fontSize: 10, lineHeight: 13, fontWeight: '600', letterSpacing: 1.0 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10, minHeight: 42 },
  amount: {
    fontFamily: typography.fonts.mono.bold,
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  unit: { fontFamily: typography.fonts.mono.medium, fontSize: 14, lineHeight: 18, fontWeight: '500' },
})
