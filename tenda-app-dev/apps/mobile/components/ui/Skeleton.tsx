import { useEffect } from 'react'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { useUnistyles } from 'react-native-unistyles'

interface SkeletonProps {
  width: number | `${number}%`
  height: number
  radius?: number
}

export function Skeleton({ width, height, radius = 8 }: SkeletonProps) {
  const { theme } = useUnistyles()
  const opacity = useSharedValue(0.55)

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    )
  }, [opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.colors.surface.inset },
        animatedStyle,
      ]}
    />
  )
}
