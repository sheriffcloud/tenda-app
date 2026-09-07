import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { CloudOff } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'

/**
 * Which of the wallet screen's two loads failed. Both render the same card —
 * one component, one style block — but they are NOT interchangeable to the
 * reader: "we couldn't find your wallets" and "we couldn't check your balances"
 * are different facts, and showing the wrong one is how the screen ended up
 * claiming `0.00 USDC` over an unloaded chain registry.
 */
export type WalletLoadErrorVariant = 'wallets' | 'balances'

/** Copy in one place, keyed by variant, so call sites pass intent not strings. */
const COPY: Record<WalletLoadErrorVariant, { title: string; body: string; retryLabel: string }> = {
  wallets: {
    title: 'Couldn’t load your wallets',
    body: 'Check your connection and try again — your wallets are safe.',
    retryLabel: 'Retry loading wallets',
  },
  balances: {
    title: 'Couldn’t load your balances',
    body: 'Your wallets are linked, we just couldn’t reach the network to read them. Your funds are safe.',
    retryLabel: 'Retry loading balances',
  },
}

/**
 * Shown on the wallet screen when a load FAILED, as opposed to being empty: a
 * transient /v1/users/me failure used to fall through to the empty state, lying
 * that the user had no wallet, and an unfetched chain registry fell through to a
 * confident zero balance. Offers an explicit retry so either recovers in place.
 */
export function WalletLoadError({
  onRetry,
  variant,
}: {
  onRetry: () => void
  /** Required on purpose: a default would let a new call site silently ship the
   *  wrong claim, which is the exact failure this component is here to fix. */
  variant: WalletLoadErrorVariant
}) {
  const { theme } = useUnistyles()
  const copy = COPY[variant]
  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.subtle },
      ]}
    >
      <View style={[s.icon, { backgroundColor: theme.colors.surface.background }]}>
        <CloudOff size={22} color={theme.colors.content.secondary} />
      </View>
      <Text style={[s.title, { color: theme.colors.content.primary }]}>{copy.title}</Text>
      <Text style={[s.body, { color: theme.colors.content.secondary }]}>{copy.body}</Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [s.button, { backgroundColor: theme.colors.brand.primary }, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={copy.retryLabel}
      >
        <Text style={[s.buttonText, { color: theme.colors.brand.onPrimary }]}>Try again</Text>
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 280 },
  button: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 13, borderRadius: 14, marginTop: 18 },
  buttonText: { fontSize: 15, fontFamily: typography.fonts.body.semibold },
})
