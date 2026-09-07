import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from './Text'

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent' | 'neutral'
type Size = 'sm' | 'md'

interface BadgeProps {
  variant?: Variant
  label: string
  size?: Size
  showDot?: boolean
}

type FeedbackVariant = Extract<Variant, 'success' | 'warning' | 'danger' | 'info'>
const FEEDBACK_TONES: readonly Variant[] = ['success', 'warning', 'danger', 'info']

const HEIGHTS: Record<Size, number> = { sm: 22, md: 24 }
const FONT_SIZES: Record<Size, number> = { sm: 11, md: 11.5 }

const s = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: 9999,
    alignSelf: 'flex-start' as const,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
})

export function Badge({ variant = 'neutral', label, size = 'md', showDot = true }: BadgeProps) {
  const { theme } = useUnistyles()

  let bg: string
  let fg: string
  let dotColor: string

  if (variant === 'neutral') {
    bg = theme.colors.surface.inset
    fg = theme.colors.content.secondary
    dotColor = theme.colors.content.tertiary
  } else if (variant === 'brand') {
    bg = theme.colors.brand.primarySurface
    fg = theme.colors.brand.primary
    dotColor = theme.colors.brand.primary
  } else if (variant === 'accent') {
    bg = theme.colors.accent.primarySurface
    fg = theme.colors.accent.primary
    dotColor = theme.colors.accent.primary
  } else if (FEEDBACK_TONES.includes(variant)) {
    const tone = theme.colors.feedback[variant as FeedbackVariant]
    bg = tone.surface
    fg = tone.base
    dotColor = tone.base
  } else {
    bg = theme.colors.surface.inset
    fg = theme.colors.content.secondary
    dotColor = theme.colors.content.tertiary
  }

  const renderDot = showDot && variant !== 'neutral'

  return (
    <View style={[s.base, { backgroundColor: bg, height: HEIGHTS[size] }]}>
      {renderDot && <View style={[s.dot, { backgroundColor: dotColor }]} />}
      <Text size={FONT_SIZES[size]} weight="bold" color={fg} style={{ letterSpacing: 0.23 }}>
        {label}
      </Text>
    </View>
  )
}
