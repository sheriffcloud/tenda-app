import { View, StyleSheet, Animated, Easing } from 'react-native'
import { useEffect, useRef } from 'react'
import { useUnistyles } from 'react-native-unistyles'

export function LoadingScreen() {
  const { theme } = useUnistyles()
  const spin = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    animation.start()
    return () => animation.stop()
  }, [spin])

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <View style={[s.container, { backgroundColor: theme.colors.surface.background }]}>
      <Animated.View
        style={[
          s.spinner,
          {
            borderColor: theme.colors.border.default,
            borderTopColor: theme.colors.brand.primary,
            transform: [{ rotate }],
          },
        ]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
})
