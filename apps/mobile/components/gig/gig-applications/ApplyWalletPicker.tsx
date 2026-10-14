/**
 * The wallet an applicant will work under, chosen at the moment they apply.
 *
 * Not polish: an assignment BAKES this address into the on-chain escrow, and
 * before the picker existed the assign silently took the primary — a wallet the
 * worker may not control at that moment and never chose. Only wallets on the
 * GIG's chain namespace are offered (an EVM gig cannot pay a Solana wallet),
 * and with none linked this says so and routes to Settings → Linked wallets
 * rather than letting an unassignable application through.
 *
 * The three not-a-list states are distinct on purpose: an empty picker while
 * the trust list is still loading, or after it FAILED, reads as "you have no
 * wallet" — the dead end this replaces. All copy is SHARED with web's dialog.
 */
import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import {
  APPLY_WALLET_HINT,
  APPLY_WALLET_LABEL,
  APPLY_WALLET_LINK_CTA,
  APPLY_WALLET_LOADING,
  APPLY_WALLET_LOAD_FAILED,
  APPLY_WALLET_REQUIRED,
  APPLY_WALLET_RETRY,
  chainLabel,
  transactionGateRoute,
  truncateWallet,
  type LinkedWallet,
} from '@tenda/shared'
import { Badge, Button, Text } from '@/components/ui'
import { spacing, radius } from '@/theme/tokens'
import type { WalletsStatus } from '@/stores/wallet-sync'

interface Props {
  /** The gig's chain — only its namespace's wallets are offered. */
  chainId: string
  status: WalletsStatus
  options: LinkedWallet[]
  /** The address currently chosen; null while nothing is choosable. */
  selected: string | null
  onSelect: (address: string) => void
  /** Re-run the wallets[] load after it failed. */
  onRetry: () => void
}

export function ApplyWalletPicker({
  chainId,
  status,
  options,
  selected,
  onSelect,
  onRetry,
}: Props) {
  const router = useRouter()
  const { theme } = useUnistyles()

  if (status === 'error') {
    return (
      <View style={[s.notice, { backgroundColor: theme.colors.feedback.danger.surface }]}>
        <Text variant="caption" color={theme.colors.feedback.danger.base}>
          {APPLY_WALLET_LOAD_FAILED}
        </Text>
        <Button variant="outline" size="md" onPress={onRetry}>
          {APPLY_WALLET_RETRY}
        </Button>
      </View>
    )
  }

  if (status !== 'ready') {
    return (
      <Text variant="caption" color={theme.colors.content.tertiary}>
        {APPLY_WALLET_LOADING}
      </Text>
    )
  }

  if (options.length === 0) {
    return (
      <View style={[s.notice, { backgroundColor: theme.colors.feedback.danger.surface }]}>
        <Text variant="caption" color={theme.colors.feedback.danger.base}>
          {APPLY_WALLET_REQUIRED(chainLabel(chainId))}
        </Text>
        <Button
          variant="outline"
          size="md"
          onPress={() =>
            router.push(transactionGateRoute('wallet_required'))
          }
        >
          {APPLY_WALLET_LINK_CTA}
        </Button>
      </View>
    )
  }

  return (
    <View style={s.group}>
      <Text variant="label" weight="semibold">
        {APPLY_WALLET_LABEL}
      </Text>
      {options.map((wallet) => {
        const isSelected = wallet.address === selected
        return (
          <Pressable
            key={wallet.address}
            onPress={() => onSelect(wallet.address)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={truncateWallet(wallet.address)}
            // Static style array, matching PayoutAccountList — the other radio
            // list in this app. Selection is the only state these rows have.
            style={[
              s.row,
              {
                borderColor: isSelected
                  ? theme.colors.brand.primary
                  : theme.colors.border.default,
                backgroundColor: isSelected
                  ? theme.colors.brand.primarySurface
                  : theme.colors.surface.card,
              },
            ]}
          >
            <Text size={14} weight={isSelected ? 'semibold' : 'regular'}>
              {truncateWallet(wallet.address)}
            </Text>
            {/* "Main", not "Primary": the marker is per chain family (#42). No chain
                name on it because every row in this picker is the gig's own chain,
                so naming it on each would be noise the reader already has. */}
            {wallet.is_primary && <Badge label="Main" variant="neutral" size="sm" />}
          </Pressable>
        )
      })}
      <Text variant="caption" color={theme.colors.content.tertiary}>
        {APPLY_WALLET_HINT}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  group: { gap: spacing.xs },
  notice: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
})
