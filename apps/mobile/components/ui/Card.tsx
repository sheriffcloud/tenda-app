import { type ReactNode } from 'react'
import { Pressable, View, type ViewProps, StyleSheet, type ViewStyle } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing, shadows } from '@/theme/tokens'

type Variant = 'elevated' | 'outlined' | 'filled'

interface CardProps extends ViewProps {
  variant?: Variant
  padding?: number
  onPress?: () => void
  children: ReactNode
}

const s = StyleSheet.create({
  base: {
    borderRadius: 18,
    padding: spacing.md,
  },
})

export function Card({
  variant = 'elevated',
  padding,
  onPress,
  children,
  style,
  ...props
}: CardProps) {
  const { theme } = useUnistyles()

  const variantStyle: ViewStyle = (() => {
    switch (variant) {
      case 'filled':
        return { backgroundColor: theme.colors.surface.inset }
      case 'elevated':
      case 'outlined':
      default:
        return {
          backgroundColor: theme.colors.surface.card,
          borderWidth: 1,
          borderColor: theme.colors.border.default,
        }
    }
  })()

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          s.base,
          variantStyle,
          padding !== undefined && { padding },
          pressed && shadows.card,
          pressed && { opacity: 0.96, transform: [{ scale: 0.995 }] },
          style,
        ]}
        {...props}
      >
        {children}
      </Pressable>
    )
  }

  return (
    <View
      style={[
        s.base,
        variantStyle,
        padding !== undefined && { padding },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  )
}
