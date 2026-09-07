import { Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'

type RouterPush = Parameters<ReturnType<typeof useRouter>['push']>[0]

/**
 * Wallet actions row, a full-width Sell / cash-out entry point (Stage 8),
 * lifted OUT of the balance hero so it's no longer cramped inside a fixed card.
 * Buy (onramp) is retired until a licensed provider is live (#61).
 */
export function WalletActions() {
  const { theme } = useUnistyles()
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push('/wallet/buy-sell' as RouterPush)}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: theme.colors.brand.primary },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Sell or cash out"
    >
      <Text style={[s.label, { color: theme.colors.brand.onPrimary }]}>Sell / Cash out</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  button: {
    marginHorizontal: 20,
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  label: { fontSize: 15, fontFamily: typography.fonts.body.semibold },
})
