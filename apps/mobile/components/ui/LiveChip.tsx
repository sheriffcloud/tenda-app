import { useEffect, useRef } from 'react'
import { View, StyleSheet, Animated, Easing } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { Text } from './Text'

interface LiveChipProps {
  label?: string
}

/**
 * "Live" indicator per `home.html .live-dot`:
 *   • 6×6 dot in --ok with a 3px ok-tinted halo
 *   • mono 11/500 +0.06em uppercase --ink-3 label
 * No pill bg, no icon, just the dot + label inline.
 */
export function LiveChip({ label = 'Live' }: LiveChipProps) {
  const { theme } = useUnistyles()
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [pulse])

  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] })

  return (
    <View style={s.row}>
      <View style={s.dotWrap}>
        <Animated.View
          style={[
            s.halo,
            { backgroundColor: theme.colors.feedback.success.base, opacity: haloOpacity },
          ]}
        />
        <View style={[s.dot, { backgroundColor: theme.colors.feedback.success.base }]} />
      </View>
      <Text style={[s.label, { color: theme.colors.content.tertiary }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotWrap: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  halo: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: typography.fonts.mono.medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    letterSpacing: 0.66,
    includeFontPadding: false,
  },
})
