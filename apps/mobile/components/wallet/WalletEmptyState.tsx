import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Wallet } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'

type RouterPush = Parameters<ReturnType<typeof useRouter>['push']>[0]

/**
 * Shown on the wallet screen when no wallet is linked, replaces the balance
 * hero (which would otherwise sit on a perpetual skeleton). Routes to the
 * linked-wallets screen to connect one.
 */
export function WalletEmptyState() {
  const { theme } = useUnistyles()
  const router = useRouter()
  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.colors.brand.primarySurface, borderColor: theme.colors.brand.primaryBorder },
      ]}
    >
      <View style={[s.icon, { backgroundColor: theme.colors.surface.background }]}>
        <Wallet size={22} color={theme.colors.brand.primary} />
      </View>
      <Text style={[s.title, { color: theme.colors.content.primary }]}>No wallet linked yet</Text>
      <Text style={[s.body, { color: theme.colors.content.secondary }]}>
        Link a wallet to hold your USDC, fund escrows, and get paid for gigs.
      </Text>
      <Pressable
        onPress={() => router.push('/settings/linked-wallets' as RouterPush)}
        style={({ pressed }) => [s.button, { backgroundColor: theme.colors.brand.solid }, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Link a wallet"
      >
        <Text style={[s.buttonText, { color: theme.colors.brand.onPrimary }]}>Link a wallet</Text>
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
