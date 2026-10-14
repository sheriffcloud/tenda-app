/**
 * "Signing with 0x12…abcd on Base Sepolia · Switch" — the signer preview a
 * wallet-opening sheet mounts above its buttons, so the wallet that is about
 * to open is a fact on screen rather than a surprise (a multichain wallet like
 * Phantom can hold the EVM session even when the user thinks of it as Solana).
 *
 * Behaviour lives in useSigningWallet; this renders it and owns the wallet
 * PICKER, because mobile's transports are per-wallet-app: changing signer here
 * means choosing the wallet app first, then the account inside it. All copy is
 * SHARED with web's row — this is the one place a reader is told which wallet
 * signs, so the two clients must not word it differently.
 */
import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { chainLabel, SIGNING_WALLET_COPY, truncateWallet } from '@tenda/shared'
// From the declaring modules, not the `@/components/ui` barrel: this row is
// mounted inside dialogs whose suites stub react-native, and pulling the whole
// barrel in drags every other primitive along with it.
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'
import { radius, spacing } from '@/theme/tokens'
import { WalletPicker } from '@/wallet/picker'
import { useSigningWallet } from '@/hooks/wallet/useSigningWallet'

export function SigningWalletRow({
  chainId,
  bound,
}: {
  chainId: string
  /**
   * The chain-bound signer for this transition (the detail wire's
   * `my_signer_address`), when the escrow already fixed one. The preview shows
   * it instead of the free session-or-primary resolution, and the affordance
   * becomes "Connect" — a targeted connect to that exact wallet, the only one
   * the chain will accept.
   */
  bound?: string | null
}) {
  const { theme } = useUnistyles()
  const signer = useSigningWallet(chainId, bound ?? null)
  const [pickerVisible, setPickerVisible] = useState(false)

  // An unknown chain has no namespace, so there is no wallet to name and no
  // switch that could succeed — say nothing rather than guess.
  if (signer.namespace === null) return null

  return (
    <View style={s.wrap}>
      <View
        style={[
          s.row,
          { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.subtle },
        ]}
      >
        <Text variant="caption" color={theme.colors.content.secondary} style={s.line}>
          {`${SIGNING_WALLET_COPY.prefix} `}
          <Text variant="caption" weight="semibold">
            {signer.address !== null
              ? truncateWallet(signer.address)
              : SIGNING_WALLET_COPY.noWallet}
          </Text>
          {` ${SIGNING_WALLET_COPY.chainSuffix(chainLabel(chainId))}`}
        </Text>
        <Button
          variant="ghost"
          size="md"
          disabled={signer.switching}
          onPress={() => setPickerVisible(true)}
        >
          {signer.switching
            ? SIGNING_WALLET_COPY.waiting
            : signer.bound
              ? SIGNING_WALLET_COPY.connectAction
              : SIGNING_WALLET_COPY.switchAction}
        </Button>
      </View>

      {signer.error !== null && (
        <Text variant="caption" color={theme.colors.feedback.danger.base} accessibilityRole="alert">
          {signer.error}
        </Text>
      )}

      <WalletPicker
        visible={pickerVisible}
        // Namespace-scoped: an EVM escrow cannot be signed by a Solana wallet,
        // so offering one would buy a refusal the reader cannot act on.
        namespace={signer.namespace}
        onClose={() => setPickerVisible(false)}
        onSelect={(adapter) => {
          setPickerVisible(false)
          void signer.switchWith(adapter)
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  line: { flexShrink: 1, minWidth: 0 },
})
