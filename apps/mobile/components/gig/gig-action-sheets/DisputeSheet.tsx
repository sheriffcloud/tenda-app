import { useState, type ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Text } from '@/components/ui/Text'
import { Spacer } from '@/components/ui/Spacer'
import { BottomSheet } from '@/components/ui/BottomSheet'

/** Raise-a-dispute sheet. Owns the reason field; resets it when closed. */
export function DisputeSheet({
  visible,
  onClose,
  bondLabel = null,
  signerRow,
  onDisputeReady,
}: {
  visible: boolean
  onClose: () => void
  /** Formatted dispute bond (e.g. "5 USDC"), or null when no bond is required. */
  bondLabel?: string | null
  /**
   * The signer preview, injected rather than built here: raising a dispute
   * posts a BOND from a specific wallet, so which one must be on screen — but
   * a reason field has no business knowing about wallets.
   */
  signerRow?: ReactNode
  onDisputeReady: (reason: string) => Promise<boolean>
}) {
  const { theme } = useUnistyles()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  // Spell out the on-chain cost + wallet step before the user commits.
  const note =
    bondLabel !== null
      ? `A ${bondLabel} bond is locked in escrow when you open a dispute (returned if it resolves in your favour). Your wallet will open to approve.`
      : 'Your wallet will open to approve when you raise the dispute.'

  function close() {
    setReason('')
    onClose()
  }

  async function handleDispute() {
    if (!reason.trim()) return
    setLoading(true)
    try {
      if (await onDisputeReady(reason.trim())) close()
    } finally {
      setLoading(false)
    }
  }

  return (
    <BottomSheet visible={visible} onClose={close} title="Raise a dispute">
      <Input
        label="Reason"
        placeholder="Describe the issue clearly..."
        helper="An admin will review and reach out. Max 2000 characters."
        value={reason}
        onChangeText={setReason}
        multiline
        numberOfLines={5}
        style={s.multiline}
        maxLength={2000}
      />
      <Spacer size={spacing.sm} />
      <Text variant="caption" color={theme.colors.content.secondary}>
        {note}
      </Text>
      {signerRow !== undefined && (
        <>
          <Spacer size={spacing.sm} />
          {signerRow}
        </>
      )}
      <Spacer size={spacing.md} />
      <Button variant="danger" size="xl" fullWidth disabled={!reason.trim()} loading={loading} onPress={handleDispute}>
        Raise Dispute
      </Button>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  multiline: { minHeight: 80, textAlignVertical: 'top' },
})
