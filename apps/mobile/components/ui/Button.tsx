import { type ReactNode } from 'react'
import { ActivityIndicator, Pressable, type PressableProps, type GestureResponderEvent, View, StyleSheet, type ViewStyle, type TextStyle } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import * as Haptics from 'expo-haptics'
import { shadows, typography } from '@/theme/tokens'
import { Text } from './Text'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
  children: string
}

const HEIGHTS: Record<Size, number> = { sm: 40, md: 48, lg: 52, xl: 56 }
const PAD_X: Record<Size, number> = { sm: 14, md: 18, lg: 22, xl: 24 }
const RADII: Record<Size, number> = { sm: 12, md: 12, lg: 14, xl: 14 }
const LABEL_BY_SIZE: Record<Size, TextStyle> = {
  sm: { fontSize: 14, lineHeight: 18 },
  md: { fontSize: 14, lineHeight: 18 },
  lg: { fontSize: 15, lineHeight: 20 },
  xl: { fontSize: 15, lineHeight: 20 },
}
const GHOST_HEIGHT = 44

const s = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullWidth: { width: '100%' },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
})

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  children,
  onPress,
  style,
  ...props
}: ButtonProps) {
  const { theme } = useUnistyles()
  const isDisabled = disabled || loading

  const handlePress = (e: GestureResponderEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onPress?.(e)
  }

  const height = variant === 'ghost' ? GHOST_HEIGHT : HEIGHTS[size]
  const paddingHorizontal = PAD_X[size]
  const borderRadius = RADII[size]

  const variantStyle: ViewStyle = (() => {
    if (isDisabled) {
      return { backgroundColor: theme.colors.surface.inset }
    }
    switch (variant) {
      case 'primary':
        return { backgroundColor: theme.colors.brand.primary, ...shadows.fab }
      case 'success':
        return {
          backgroundColor: theme.colors.feedback.success.base,
          ...shadows.fab,
          shadowColor: theme.colors.feedback.success.base,
        }
      case 'danger':
        return {
          backgroundColor: theme.colors.feedback.danger.base,
          ...shadows.fab,
          shadowColor: theme.colors.feedback.danger.base,
        }
      case 'secondary':
        return { backgroundColor: theme.colors.surface.inset }
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: theme.colors.border.default,
        }
      case 'ghost':
      default:
        return { backgroundColor: 'transparent' }
    }
  })()

  const textColor = isDisabled
    ? theme.colors.content.tertiary
    : variant === 'primary' || variant === 'danger' || variant === 'success'
      ? theme.colors.brand.onPrimary
      : variant === 'ghost'
        ? theme.colors.content.secondary
        : theme.colors.content.primary

  const spinnerColor = variant === 'primary' || variant === 'danger' || variant === 'success'
    ? theme.colors.brand.onPrimary
    : theme.colors.brand.primary

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={(state) => [
        s.base,
        { height, paddingHorizontal, borderRadius },
        variantStyle,
        fullWidth && s.fullWidth,
        state.pressed && !isDisabled && s.pressed,
        // Pressable's style prop is a value OR a state callback, resolve it
        // so callers can pass either without a cast.
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <View style={s.content}>
          {icon}
          <Text
            style={[typography.styles.button, LABEL_BY_SIZE[size]]}
            color={textColor}
            numberOfLines={1}
          >
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  )
}
