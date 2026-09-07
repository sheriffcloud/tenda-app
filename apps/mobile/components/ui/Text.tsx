import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { MAXIMUM_FONT_SIZE_MULTIPLIER } from '@/theme/accessibility'

type Variant = 'heading' | 'subheading' | 'body' | 'caption' | 'label'
type Weight = 'regular' | 'medium' | 'semibold' | 'bold'

interface TextProps extends RNTextProps {
  variant?: Variant
  weight?: Weight
  color?: string
  align?: 'left' | 'center' | 'right'
  size?: number
}

const variantStyles = StyleSheet.create({
  heading: {
    fontSize: typography.styles.h2.fontSize,
    fontFamily: typography.fonts.display.bold,
    lineHeight: typography.styles.h2.lineHeight,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: typography.styles.bodySmall.fontSize,
    fontFamily: typography.fonts.display.medium,
    lineHeight: typography.styles.bodySmall.lineHeight,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: typography.styles.body.fontSize,
    fontFamily: typography.fonts.body.regular,
    lineHeight: typography.styles.body.lineHeight,
  },
  caption: {
    fontSize: typography.styles.bodySmall.fontSize,
    fontFamily: typography.fonts.body.regular,
    lineHeight: typography.styles.bodySmall.lineHeight,
  },
  label: {
    fontSize: typography.styles.bodySmall.fontSize,
    fontFamily: typography.fonts.body.medium,
    lineHeight: typography.styles.bodySmall.lineHeight,
  },
})

const weightStyles = StyleSheet.create({
  regular: { fontFamily: typography.fonts.body.regular },
  medium: { fontFamily: typography.fonts.body.medium },
  semibold: { fontFamily: typography.fonts.body.semibold },
  bold: { fontFamily: typography.fonts.body.bold },
})

export function Text({
  variant = 'body',
  weight,
  color,
  align,
  size,
  style,
  ...props
}: TextProps) {
  const { theme } = useUnistyles()

  return (
    <RNText
      maxFontSizeMultiplier={MAXIMUM_FONT_SIZE_MULTIPLIER}
      style={[
        { color: variant === 'caption' ? theme.colors.content.secondary : theme.colors.content.primary, fontFamily: typography.fonts.body.regular },
        variantStyles[variant],
        weight && weightStyles[weight],
        color !== undefined && { color },
        align !== undefined && { textAlign: align },
        size !== undefined && { fontSize: size },
        style,
      ]}
      {...props}
    />
  )
}
