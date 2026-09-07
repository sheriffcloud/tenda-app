import { View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Text, Button } from '@/components/ui'
import { spacing } from '@/theme/tokens'

/**
 * Shown on the trade/sell surfaces when the user has no verified linked wallet
 * for the selected market — replaces the old dead "Connect a wallet" caption
 * with an actionable route to Settings → Linked wallets.
 */
export function NoLinkedWalletNotice({ message }: { message?: string }) {
  const router = useRouter()
  const { theme } = useUnistyles()
  return (
    <View style={[s.card, { backgroundColor: theme.colors.surface.inset }]}>
      <Text size={13} color={theme.colors.content.secondary} align="center">
        {message ?? 'Link a wallet to trade crypto.'}
      </Text>
      <Button
        variant="outline"
        size="md"
        fullWidth
        onPress={() => router.push('/settings/linked-wallets' as Parameters<typeof router.push>[0])}
      >
        Link a wallet
      </Button>
    </View>
  )
}

const s = StyleSheet.create({
  card: { gap: spacing.sm, borderRadius: 14, padding: spacing.md },
})
