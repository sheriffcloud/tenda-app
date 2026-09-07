import { useState } from 'react'
import { View, TextInput, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Paperclip, ArrowUp } from 'lucide-react-native'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { typography, shadows } from '@/theme/tokens'
import { MAXIMUM_FONT_SIZE_MULTIPLIER } from '@/theme/accessibility'

interface ChatInputProps {
  onSend: (text: string) => void
  onAttach?: () => void
  disabled?: boolean
}

export function ChatInput({ onSend, onAttach, disabled }: ChatInputProps) {
  const { theme } = useUnistyles()
  const insets = useSafeAreaInsets()
  // The screen lifts this bar by the full keyboard height (which spans the
  // nav-bar area), so the nav-bar inset is only needed when the keyboard is down.
  const keyboardVisible = useKeyboardHeight() > 0
  const [text, setText] = useState('')

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  const canSend = text.trim().length > 0 && !disabled

  return (
    <View
      style={[
        s.wrap,
        {
          backgroundColor: theme.colors.surface.background,
          borderTopColor: theme.colors.border.subtle,
          paddingBottom: keyboardVisible ? 12 : 12 + insets.bottom,
        },
      ]}
    >
      <View
        style={[
          s.pill,
          {
            backgroundColor: theme.colors.surface.card,
            borderColor: theme.colors.border.subtle,
          },
        ]}
      >
        {onAttach && (
          <Pressable
            onPress={onAttach}
            style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Attach file"
            accessibilityRole="button"
          >
            <Paperclip size={18} color={theme.colors.content.tertiary} />
          </Pressable>
        )}

        <TextInput
          value={text}
          onChangeText={setText}
          maxFontSizeMultiplier={MAXIMUM_FONT_SIZE_MULTIPLIER}
          placeholder="Message…"
          placeholderTextColor={theme.colors.content.tertiary}
          multiline
          maxLength={2000}
          style={[s.field, { color: theme.colors.content.primary }]}
          onSubmitEditing={handleSend}
          submitBehavior="submit"
        />

        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={[
            s.sendBtn,
            canSend
              ? [{ backgroundColor: theme.colors.brand.primary }, shadows.fab]
              : { backgroundColor: theme.colors.surface.inset },
          ]}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          <ArrowUp
            size={18}
            color={canSend ? theme.colors.brand.onPrimary : theme.colors.content.tertiary}
            strokeWidth={2.5}
          />
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: {
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  pill: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  field: {
    flex: 1,
    fontFamily: typography.fonts.body.regular,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 0,
    minHeight: 24,
    maxHeight: 96,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
})
