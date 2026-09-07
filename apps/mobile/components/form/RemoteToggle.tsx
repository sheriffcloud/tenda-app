import { Pressable, View, StyleSheet, Animated } from 'react-native'
import { useEffect, useRef } from 'react'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'

interface RemoteToggleProps {
  value: boolean
  onChange: (remote: boolean) => void
  /** Override the title; default "Remote" */
  title?: string
  /** Override the hint; default conditional copy */
  hint?: string
}

/**
 * Toggle card per `create-gig.html .toggle-card`:
 *   64h R14 --card with 1px --line, 14/600 title + 12 hint, trailing 44×26 iOS-style switch.
 *   Switch: --ink-3 (off) / --brand (on), 22×22 white knob slides 18px.
 */
export function RemoteToggle({ value, onChange, title = 'Remote', hint }: RemoteToggleProps) {
  const { theme } = useUnistyles()
  const knob = useRef(new Animated.Value(value ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(knob, {
      toValue: value ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start()
  }, [value, knob])

  const knobLeft = knob.interpolate({ inputRange: [0, 1], outputRange: [2, 20] })
  const trackBg = knob.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.border.strong, theme.colors.brand.primary],
  })

  const defaultHint = value
    ? 'No physical location, visible globally.'
    : 'Worker comes to a specific location.'

  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        s.row,
        {
          backgroundColor: theme.colors.surface.card,
          borderColor: theme.colors.border.default,
        },
        pressed && { opacity: 0.97 },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
    >
      <View style={s.body}>
        <Text style={[s.title, { color: theme.colors.content.primary }]}>{title}</Text>
        <Text style={[s.hint, { color: theme.colors.content.tertiary }]}>{hint ?? defaultHint}</Text>
      </View>
      <Animated.View style={[s.track, { backgroundColor: trackBg }]}>
        <Animated.View style={[s.knob, { left: knobLeft }]} />
      </Animated.View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    marginHorizontal: 20,
    height: 64,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.07,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    flexShrink: 0,
    position: 'relative',
  },
  knob: {
    position: 'absolute',
    top: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.20,
    shadowRadius: 3,
    elevation: 2,
  },
})
