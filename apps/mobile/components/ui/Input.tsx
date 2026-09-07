import { useState } from 'react'
import { TextInput, View, type TextInputProps, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { MAXIMUM_FONT_SIZE_MULTIPLIER } from '@/theme/accessibility'
import { Text } from './Text'

type Variant = 'inset' | 'compact'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  helper?: string
  icon?: React.ReactNode
  showCounter?: boolean
  variant?: Variant
}

const s = StyleSheet.create({
  wrapper: { gap: 6 },

  // Anatomy A, `inset` (canonical create-gig.html .input)
  insetContainer: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'column',
    gap: 2,
  },
  insetContainerWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  insetBody: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
  },
  insetLabel: {
    fontFamily: typography.fonts.mono,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
  insetInput: {
    fontFamily: typography.fonts.body.regular,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: -0.075,
    minHeight: 20,
    padding: 0,
  },
  insetInputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },

  // Anatomy B, `compact` (update-profile.html .field/.input)
  compactWrapper: {
    flexDirection: 'column',
    gap: 6,
  },
  compactLabel: {
    fontFamily: typography.fonts.body.semibold,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: -0.0625,
  },
  compactContainer: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactInput: {
    flex: 1,
    fontFamily: typography.fonts.body.regular,
    fontSize: 15,
    lineHeight: 20,
    padding: 0,
  },
  compactInputMultiline: {
    minHeight: 120,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  compactContainerMultiline: {
    height: 120,
    alignItems: 'flex-start',
  },

  // Footer (shared by both anatomies, outside container). Column layout: helper
  // on its own row, counter on a separate row aligned to the right edge.
  footer: {
    gap: 3,
    paddingHorizontal: 4,
  },
  count: {
    alignSelf: 'flex-end',
    fontFamily: typography.fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.12,
  },
})

export function Input({
  label,
  error,
  helper,
  icon,
  showCounter,
  variant = 'inset',
  multiline,
  style,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false)
  const { theme } = useUnistyles()

  const borderColor = error
    ? theme.colors.feedback.danger.base
    : focused
      ? theme.colors.brand.primary
      : theme.colors.border.default

  const charCount = typeof props.value === 'string' ? props.value.length : 0
  const max = props.maxLength
  const nearLimit = max !== undefined && charCount >= max * 0.9
  const atLimit = max !== undefined && charCount >= max

  // Helper/error and the counter each get their own row so a growing counter
  // ("5/1500" → "1234/1500") never reflows or crowds the helper text.
  const footer = (error || helper || (showCounter && max !== undefined)) ? (
    <View style={s.footer}>
      {error ? (
        <Text size={12} weight="medium" color={theme.colors.feedback.danger.base}>{error}</Text>
      ) : helper ? (
        <Text size={12} color={theme.colors.content.tertiary}>{helper}</Text>
      ) : null}
      {showCounter && max !== undefined && (
        <Text
          style={[
            s.count,
            atLimit && { fontWeight: '600' },
          ]}
          color={
            atLimit
              ? theme.colors.feedback.danger.base
              : nearLimit
                ? theme.colors.feedback.warning.base
                : theme.colors.content.tertiary
          }
        >
          {charCount}/{max}
        </Text>
      )}
    </View>
  ) : null

  if (variant === 'compact') {
    return (
      <View style={s.compactWrapper}>
        {label && (
          <Text style={s.compactLabel} color={theme.colors.content.secondary}>
            {label}
          </Text>
        )}
        <View
          style={[
            s.compactContainer,
            multiline && s.compactContainerMultiline,
            { backgroundColor: theme.colors.surface.background, borderColor },
          ]}
        >
          {icon}
          {/* Inline TextInput style override for compact anatomy */}
          <TextInput
            maxFontSizeMultiplier={MAXIMUM_FONT_SIZE_MULTIPLIER}
            placeholderTextColor={theme.colors.content.placeholder}
            multiline={multiline}
            style={[
              s.compactInput,
              { color: theme.colors.content.primary },
              multiline && s.compactInputMultiline,
              style,
            ]}
            onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
            onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
            {...props}
          />
        </View>
        {footer}
      </View>
    )
  }

  // variant === 'inset' (default)
  return (
    <View style={s.wrapper}>
      <View
        style={[
          s.insetContainer,
          Boolean(icon) && s.insetContainerWithIcon,
          { backgroundColor: theme.colors.surface.card, borderColor },
        ]}
      >
        {icon}
        <View style={s.insetBody}>
          {label && (
            <Text style={s.insetLabel} color={theme.colors.content.tertiary}>
              {label}
            </Text>
          )}
          <TextInput
            maxFontSizeMultiplier={MAXIMUM_FONT_SIZE_MULTIPLIER}
            placeholderTextColor={theme.colors.content.placeholder}
            multiline={multiline}
            style={[
              s.insetInput,
              { color: theme.colors.content.primary },
              multiline && s.insetInputMultiline,
              style,
            ]}
            onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
            onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
            {...props}
          />
        </View>
      </View>
      {footer}
    </View>
  )
}
