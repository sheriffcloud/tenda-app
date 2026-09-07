import { Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { useRouter } from 'expo-router'
import { Text } from '@/components/ui/Text'
import { useSpendableBalance } from '@/hooks/useSpendableBalance'
import { toBigIntOrNull } from '@/wallet/balances/raw-amount'

interface AddFundsNudgeProps {
  chainId: string
  asset: string
  /** Budget in base units. */
  paymentRaw: number
}

/**
 * Stage 8 chained buy-then-post nudge: advisory early warning that no linked
 * wallet can cover the budget, shown while the form is still being filled.
 * Funding happens at publish, where `ensureSufficientBalance` is the actual
 * stop — this only saves the user from reaching that point unaware.
 *
 * Renders for the escrow's ACTUAL asset on the selected chain. It previously
 * compared the budget against native SOL and skipped stablecoins outright,
 * which meant it never once fired for a real gig (gig policy pins the asset to
 * USDC via `gigAssetByChain`).
 *
 * Reads through `useSpendableBalance` — the SAME `readSpendableBalance` the
 * publish-time check uses — so the hint and the block always agree, and a user
 * whose second linked wallet holds the money is never told they're short.
 *
 * Silent unless the balance is KNOWN and short: an unread balance is unknown,
 * not zero, so an RPC failure never accuses the user of being underfunded.
 */
export function AddFundsNudge({ chainId, asset, paymentRaw }: AddFundsNudgeProps) {
  const { theme } = useUnistyles()
  const router = useRouter()
  const { balance } = useSpendableBalance(chainId, asset)

  // BigInt-exact: base units exceed Number.MAX_SAFE_INTEGER on 18-decimal
  // assets, where a numeric compare would silently mis-answer. Parsed through
  // the shared helper so an unparseable budget (a draft whose amount_raw came
  // back malformed reaches here as NaN) reads as "no answer" — a bare BigInt()
  // would throw and take the whole form down over an advisory hint.
  const required = toBigIntOrNull(paymentRaw)
  const available = balance === null ? null : toBigIntOrNull(balance.amountRaw)
  if (required === null || available === null || required <= available) return null

  return (
    <Pressable
      onPress={() => router.push('/exchange' as Parameters<typeof router.push>[0])}
      style={({ pressed }) => [
        s.addFunds,
        { backgroundColor: theme.colors.brand.primarySurface, borderColor: theme.colors.brand.primaryBorder },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Add funds"
    >
      <Text style={[s.addFundsText, { color: theme.colors.brand.primary }]}>
        Your balance won&apos;t cover this amount, add funds. Your draft stays right here.
      </Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  addFunds: {
    marginHorizontal: 20,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  addFundsText: { fontSize: 12.5, lineHeight: 17 },
})
