import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useUnistyles } from 'react-native-unistyles'

interface OnboardingDotsProps {
  total: number
  current: number
}

interface DotProps {
  active: boolean
}

function Dot({ active }: DotProps) {
  const { theme } = useUnistyles()

  const style = useAnimatedStyle(() => ({
    width: withTiming(active ? 24 : 6, { duration: 220 }),
    backgroundColor: withTiming(
      active ? theme.colors.brand.primary : theme.colors.border.default,
      { duration: 220 },
    ),
  }))

  return <Animated.View style={[s.dot, style]} />
}

export function OnboardingDots({ total, current }: OnboardingDotsProps) {
  return (
    <Animated.View style={s.row}>
      {Array.from({ length: total }, (_, i) => (
        <Dot key={i} active={i === current} />
      ))}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
})
