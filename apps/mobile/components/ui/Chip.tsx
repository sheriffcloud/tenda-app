import { type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from './Text'

type Variant = 'filter' | 'form'
type Category = 'delivery' | 'photo' | 'errand' | 'service' | 'digital'

interface ChipProps {
  label: string
  selected?: boolean
  onPress?: () => void
  variant?: Variant
  category?: Category
  icon?: ReactNode
  /** Renders dimmed and ignores presses (e.g. a chain without a linked wallet). */
  disabled?: boolean
}

const s = StyleSheet.create({
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
    alignSelf: 'flex-start' as const,
  },
  form: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start' as const,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
})

export function Chip({
  label,
  selected = false,
  onPress,
  variant = 'filter',
  category,
  icon,
  disabled = false,
}: ChipProps) {
  const { theme } = useUnistyles()

  let backgroundColor: string
  let borderColor: string
  let textColor: string
  let fontWeight: '500' | '600' | '700' = '500'

  if (category) {
    const cat = theme.colors.category[category]
    backgroundColor = cat.surface
    borderColor = cat.border
    textColor = cat.text
    fontWeight = selected ? '700' : '500'
  } else if (selected) {
    backgroundColor = theme.colors.brand.primarySurface
    borderColor = theme.colors.brand.primaryBorder
    textColor = theme.colors.brand.primary
    fontWeight = '600'
  } else if (variant === 'form') {
    backgroundColor = theme.colors.surface.card
    borderColor = theme.colors.border.default
    textColor = theme.colors.content.primary
    fontWeight = '500'
  } else {
    backgroundColor = 'transparent'
    borderColor = theme.colors.border.default
    textColor = theme.colors.content.secondary
    fontWeight = '500'
  }

  const containerStyle = variant === 'form' ? s.form : s.filter

  const inner = (
    <>
      {icon && <View>{icon}</View>}
      <Text size={13} color={textColor} style={{ fontWeight, lineHeight: 18, includeFontPadding: false }}>
        {label}
      </Text>
    </>
  )

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          containerStyle,
          { backgroundColor, borderColor },
          pressed && s.pressed,
        ]}
      >
        {inner}
      </Pressable>
    )
  }

  return (
    <View style={[containerStyle, { backgroundColor, borderColor }, disabled && s.disabled]}>
      {inner}
    </View>
  )
}
