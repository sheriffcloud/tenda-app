/**
 * The apply sheet: the optional pitch, the obligation the applicant is taking
 * on, and the WALLET they will work under.
 *
 * The obligation notice is REQUIRED here, not optional polish. D2 makes an
 * applicant accountable for a gig they are assigned to, and D5 leaves
 * availability to the worker rather than verifying it — so the moment they
 * raise their hand is the only moment that bargain can honestly be stated.
 *
 * The wallet is load-bearing for the same reason: an assignment bakes the
 * chosen address into the on-chain escrow, so it has to be chosen here rather
 * than defaulted to the primary behind the applicant's back. Rendering and the
 * three not-a-list states live in ApplyWalletPicker; this owns the choice.
 */
import { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import {
  APPLICATION_MESSAGE_MAX_LENGTH,
  APPLY_MESSAGE_LABEL,
  APPLY_MESSAGE_PLACEHOLDER,
  APPLY_OBLIGATION,
  APPLY_SUBMIT_LABEL,
  APPLY_TITLE,
  findChain,
  preferredWalletAddress,
  verifiedWalletsOn,
} from '@tenda/shared'
import { spacing, radius } from '@/theme/tokens'
import { BottomSheet, Button, Input, Text } from '@/components/ui'
import { useAuthStore } from '@/stores/auth.store'
import { ApplyWalletPicker } from './ApplyWalletPicker'

interface Props {
  visible: boolean
  busy: boolean
  /** The gig's chain — the picker offers ONLY wallets on its namespace. */
  chainId: string
  /** A previous application's recorded wallet (re-apply preselects it). */
  initialWallet?: string | null
  onClose: () => void
  /** Resolves true once the application is stored; the sheet closes on true. */
  onSubmit: (message: string | null, walletAddress: string) => Promise<boolean>
}

export function ApplySheet({
  visible,
  busy,
  chainId,
  initialWallet = null,
  onClose,
  onSubmit,
}: Props) {
  const { theme } = useUnistyles()
  const [message, setMessage] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const wallets = useAuthStore((s) => s.wallets)
  const walletsStatus = useAuthStore((s) => s.walletsStatus)
  const refreshMe = useAuthStore((s) => s.refreshMe)

  // The trust list loads once per session; OPENING the sheet is the moment it
  // becomes load-bearing — an empty list here must mean "none linked", never
  // "not loaded yet", and `walletsStatus` is what separates the two. Already
  // `ready` needs no round-trip; anything else does.
  //
  // The status is read imperatively and is NOT a dependency, deliberately:
  // `refreshMe` moves it to `loading` and then to `ready`/`error`, so an
  // effect that depended on it would re-fire on each of those and re-request
  // forever after a failure. Retrying is the picker's explicit button.
  useEffect(() => {
    if (visible && useAuthStore.getState().walletsStatus !== 'ready') void refreshMe()
  }, [visible, refreshMe])

  const ns = findChain(chainId)?.namespace ?? null
  const options = ns === null ? [] : verifiedWalletsOn(ns, wallets)
  const selected =
    picked !== null && options.some((w) => w.address === picked)
      ? picked
      : ns === null
        ? null
        : preferredWalletAddress(ns, initialWallet, wallets)

  async function handleSubmit() {
    // Unreachable through the UI: the submit control is `disabled` for exactly
    // this condition, and ApplySheet.wallet.test presses it with no wallet and
    // watches `onSubmit` stay uncalled. Not removable either — this is what
    // narrows `selected` to a string for `onSubmit`, and without it the call
    // needs a `?? ''` that would post an empty wallet address.
    if (selected === null) return
    // Trimmed to null here as well as server-side: an all-whitespace pitch and
    // no pitch mean the same thing, and the two sides must agree on that.
    const trimmed = message.trim()
    if (await onSubmit(trimmed === '' ? null : trimmed, selected)) {
      setMessage('')
      setPicked(null)
      onClose()
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={APPLY_TITLE}>
      <View style={s.body}>
        <View
          style={[s.notice, { backgroundColor: theme.colors.feedback.warning.surface }]}
        >
          <Text variant="caption" color={theme.colors.feedback.warning.base}>
            {APPLY_OBLIGATION}
          </Text>
        </View>

        <ApplyWalletPicker
          chainId={chainId}
          status={walletsStatus}
          options={options}
          selected={selected}
          onSelect={setPicked}
          onRetry={() => void refreshMe()}
        />

        <Input
          label={APPLY_MESSAGE_LABEL}
          placeholder={APPLY_MESSAGE_PLACEHOLDER}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={APPLICATION_MESSAGE_MAX_LENGTH}
          showCounter
        />

        <Button
          variant="primary"
          size="xl"
          fullWidth
          loading={busy}
          disabled={selected === null}
          onPress={handleSubmit}
        >
          {APPLY_SUBMIT_LABEL}
        </Button>
      </View>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.md },
  notice: { padding: spacing.md, borderRadius: radius.md },
})
