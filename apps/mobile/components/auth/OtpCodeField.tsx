import { useRef } from 'react'
import { View, StyleSheet, TextInput } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui'
import { typography } from '@/theme/tokens'

interface OtpCodeFieldProps {
  value: string
  onChange: (digits: string) => void
  /** Number of digits (default 6). */
  length?: number
  autoFocus?: boolean
  editable?: boolean
  accessibilityLabel?: string
}

/**
 * Segmented one-time-code entry: a hidden numeric TextInput drives N display
 * cells, the active cell highlighted. Shared by every OTP screen (sign-in and
 * Sign-in & security link) so the code-entry UI lives in exactly one place.
 * `onChange` receives digits-only, capped at `length`; the caller decides when
 * to auto-submit (typically `digits.length === length`).
 */
export function OtpCodeField({
  value,
  onChange,
  length = 6,
  autoFocus,
  editable = true,
  accessibilityLabel = 'One-time code',
}: OtpCodeFieldProps) {
  const { theme } = useUnistyles()
  const inputRef = useRef<TextInput>(null)
  const cells = Array.from({ length }, (_, i) => value[i] ?? '')

  return (
    <View style={s.wrap}>
      {/* Hidden input captures the keystrokes; the cells are purely visual. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        editable={editable}
        style={s.hiddenInput}
        accessibilityLabel={accessibilityLabel}
      />
      <View style={s.cellRow} onTouchStart={() => inputRef.current?.focus()}>
        {cells.map((c, i) => (
          <View
            key={i}
            style={[
              s.cell,
              {
                backgroundColor: theme.colors.surface.card,
                borderColor: i === value.length ? theme.colors.brand.primary : theme.colors.border.default,
              },
            ]}
          >
            <Text style={[s.cellText, { color: theme.colors.content.primary }]}>{c}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: 0 },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  cellRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginVertical: 10 },
  cell: {
    width: 46,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 22, fontFamily: typography.fonts.body.semibold },
})
