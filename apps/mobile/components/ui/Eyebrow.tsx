import { Text } from './Text'
import { useUnistyles } from 'react-native-unistyles'
import { StyleSheet } from 'react-native'
import type { StyleProp, TextStyle } from 'react-native'
import { typography } from '@/theme/tokens'

interface EyebrowProps {
  children: string
  /** Override the default tertiary tint, e.g. for accent eyebrows on a tinted card. */
  color?: string
  style?: StyleProp<TextStyle>
}

/**
 * Mono uppercase eyebrow primitive (9.5 / 600 / +0.95 letterSpacing).
 * Use directly inside cards/rows or wrap with padding via the `style` prop.
 * For form/section headers with default 18/8/20 padding, prefer SectionLabel.
 */
export function Eyebrow({ children, color, style }: EyebrowProps) {
  const { theme } = useUnistyles()
  return (
    <Text style={[s.eyebrow, { color: color ?? theme.colors.content.tertiary }, style]}>
      {children.toUpperCase()}
    </Text>
  )
}

const s = StyleSheet.create({
  eyebrow: {
    fontFamily: typography.fonts.mono,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
    includeFontPadding: false,
  },
})
