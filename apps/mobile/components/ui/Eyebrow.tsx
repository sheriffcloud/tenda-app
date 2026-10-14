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
 * Mono uppercase eyebrow primitive — `typography.styles.eyebrow` (9.5 / 600 /
 * +0.95 letterSpacing), the uppercase applied here. The numbers are a token
 * style rather than literals so web and tendahq draw the same label (#59c).
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
    ...typography.styles.eyebrow,
    includeFontPadding: false,
  },
})
