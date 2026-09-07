/**
 * The apply sheet: the optional pitch, and the obligation the applicant is
 * taking on.
 *
 * The obligation notice is REQUIRED here, not optional polish. D2 makes an
 * applicant accountable for a gig they are assigned to, and D5 leaves
 * availability to the worker rather than verifying it — so the moment they
 * raise their hand is the only moment that bargain can honestly be stated.
 */
import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { APPLICATION_MESSAGE_MAX_LENGTH } from '@tenda/shared'
import { spacing, radius } from '@/theme/tokens'
import { BottomSheet, Button, Input, Text } from '@/components/ui'
import {
  APPLY_MESSAGE_LABEL,
  APPLY_MESSAGE_PLACEHOLDER,
  APPLY_OBLIGATION,
  APPLY_SUBMIT_LABEL,
  APPLY_TITLE,
} from './copy'

interface Props {
  visible: boolean
  busy: boolean
  onClose: () => void
  /** Resolves true once the application is stored; the sheet closes on true. */
  onSubmit: (message: string | null) => Promise<boolean>
}

export function ApplySheet({ visible, busy, onClose, onSubmit }: Props) {
  const { theme } = useUnistyles()
  const [message, setMessage] = useState('')

  async function handleSubmit() {
    // Trimmed to null here as well as server-side: an all-whitespace pitch and
    // no pitch mean the same thing, and the two sides must agree on that.
    const trimmed = message.trim()
    if (await onSubmit(trimmed === '' ? null : trimmed)) {
      setMessage('')
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

        <Input
          label={APPLY_MESSAGE_LABEL}
          placeholder={APPLY_MESSAGE_PLACEHOLDER}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={APPLICATION_MESSAGE_MAX_LENGTH}
          showCounter
        />

        <Button variant="primary" size="xl" fullWidth loading={busy} onPress={handleSubmit}>
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
