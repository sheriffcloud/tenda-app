/**
 * Posting needs a linked wallet — said at the top of the composer (#59).
 *
 * The server has always known this and enforced it, but it only spoke at the
 * signature: a 403 after the whole form was filled, answered by a push to
 * Settings that took the form with it. The facts were on screen from the
 * first step — `gigChainOptions` had already worked out that no chain was
 * signable — and nothing asked them the question.
 *
 * It does NOT block composing. Someone may want to write the gig now and link
 * a wallet before they sign, and a form that refuses to be filled would be a
 * second wall rather than a fix. The way out is offered, never taken: an
 * automatic redirect is what lost the form in the first place.
 *
 * Hand-rolled rather than `NoticeBanner` because it carries an affordance —
 * the same reason `DraftsBanner` and `NotificationNudgeBanner` were kept out
 * of it, and the shape `ApplyWalletPicker` already uses for this exact gate.
 */
import { View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { composerWalletNotice, transactionGateRoute, type ComposerWalletGate } from '@tenda/shared'
import { Button, Text } from '@/components/ui'
import { spacing, radius } from '@/theme/tokens'

interface Props {
  gate: ComposerWalletGate
  /** Re-run the wallets[] load — only reachable from the `unavailable` state. */
  onRetry: () => void
}

export function ComposerWalletNotice({ gate, onRetry }: Props) {
  const router = useRouter()
  const { theme } = useUnistyles()

  // Null for 'ok' (nothing to say) and for 'unknown' — which has not EARNED
  // anything to say: the wallet list or the chain registry is still settling,
  // and a notice there would accuse a reader who may well have a wallet.
  const notice = composerWalletNotice(gate)
  if (notice === null) return null

  const palette = theme.colors.feedback.warning
  return (
    <View
      accessible
      accessibilityRole="alert"
      style={[s.notice, { backgroundColor: palette.surface, borderColor: palette.base }]}
    >
      <Text size={13} weight="semibold" color={palette.base}>
        {notice.title}
      </Text>
      <Text size={12} color={theme.colors.content.secondary} style={s.body}>
        {notice.body}
      </Text>
      <Button
        variant="outline"
        size="md"
        onPress={
          notice.action === 'retry'
            ? onRetry
            : () => router.push(transactionGateRoute('wallet_required'))
        }
      >
        {notice.cta}
      </Button>
    </View>
  )
}

const s = StyleSheet.create({
  notice: {
    gap: spacing.sm,
    margin: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  body: { lineHeight: 17 },
})
