/**
 * Why there is nothing to sell — said instead of the asset picker (#60).
 * Twin of web's sell/SellWalletNotice; the copy for both comes from the shared
 * `sellWalletNotice`, so the two can only diverge in how they are drawn.
 *
 * Replaces the unconditional NoLinkedWalletNotice this surface used to render
 * for an empty list. The list has four ways of being empty and only ONE of
 * them is "you have no wallet" — saying that while we are still looking is a
 * claim about the reader made before we had asked.
 */
import { View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { sellWalletNotice, transactionGateRoute, type WalletSectionState } from '@tenda/shared'
import { Button, Text } from '@/components/ui'
import { spacing } from '@/theme/tokens'

interface Props {
  section: WalletSectionState
  /** The mode-specific line — cashing out and posting an offer differ. */
  noWalletMessage: string
  onRetryWallets: () => void
  onRetryChains: () => void
}

export function SellWalletNotice({
  section,
  noWalletMessage,
  onRetryWallets,
  onRetryChains,
}: Props) {
  const router = useRouter()
  const { theme } = useUnistyles()

  const notice = sellWalletNotice(section, noWalletMessage)
  if (notice === null) return null

  const onPress =
    notice.action === 'link'
      ? () => router.push(transactionGateRoute('wallet_required'))
      : notice.action === 'retry-wallets'
        ? onRetryWallets
        : onRetryChains

  return (
    <View style={[s.card, { backgroundColor: theme.colors.surface.inset }]}>
      <Text size={13} color={theme.colors.content.secondary} align="center">
        {notice.message}
      </Text>
      {/* No control while we are still looking: waiting is the only honest
          response, so there is nothing to press. */}
      {notice.cta !== null && (
        <Button variant="outline" size="md" fullWidth onPress={onPress}>
          {notice.cta}
        </Button>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: { gap: spacing.sm, borderRadius: 14, padding: spacing.md },
})
