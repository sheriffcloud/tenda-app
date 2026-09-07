import { useEffect } from 'react';
import { useUnistyles } from 'react-native-unistyles';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface SpinnerProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Spinner({ size = 36, color, strokeWidth = 2.5 }: SpinnerProps) {
  const { theme } = useUnistyles();
  const rotation = useSharedValue(0);

  const spinnerColor = color || theme.colors.brand.primary;

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 700,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: `${spinnerColor}20`,
          borderTopColor: spinnerColor,
        },
        animatedStyle,
      ]}
    />
  );
}
