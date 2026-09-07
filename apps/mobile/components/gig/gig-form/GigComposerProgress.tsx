import { useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { radius, spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { GIG_COMPOSER_STEPS, type GigComposerStep } from './gig-composer.steps'

interface Props {
  step: GigComposerStep
  /** Fired only for completed steps — upcoming ones are never pressable. */
  onStepPress: (index: number) => void
}

export function GigComposerProgress({ step, onStepPress }: Props) {
  const { theme } = useUnistyles()
  const activeIndex = GIG_COMPOSER_STEPS.findIndex((item) => item.key === step)
  const active = GIG_COMPOSER_STEPS[activeIndex]

  return (
    <View style={s.container}>
      <View style={s.track}>
        {GIG_COMPOSER_STEPS.map((item, index) => {
          const complete = index < activeIndex
          const reached = index <= activeIndex
          return (
            <Pressable
              key={item.key}
              style={s.step}
              disabled={!complete}
              onPress={() => onStepPress(index)}
              // The visible column is ~24px tall; stretch the touch target
              // toward the 44px minimum without shifting layout.
              hitSlop={{ top: 10, bottom: 10 }}
              accessibilityRole="button"
              accessibilityLabel={complete ? `Return to ${item.label}` : item.label}
            >
              <SegmentFill
                filled={reached}
                fillColor={theme.colors.brand.primary}
                trackColor={theme.colors.surface.inset}
              />
              <Text
                variant="caption"
                weight={index === activeIndex ? 'semibold' : 'regular'}
                color={reached ? theme.colors.brand.primary : theme.colors.content.tertiary}
              >
                {item.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text variant="subheading" style={s.title}>{active.title}</Text>
      <Text variant="caption" color={theme.colors.content.secondary}>{active.subtitle}</Text>
    </View>
  )
}

/** Sweeps full when its step is reached, drains when the user steps back. */
function SegmentFill({ filled, fillColor, trackColor }: {
  filled: boolean
  fillColor: string
  trackColor: string
}) {
  const progress = useRef(new Animated.Value(filled ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(progress, { toValue: filled ? 1 : 0, duration: 220, useNativeDriver: false }).start()
  }, [filled, progress])

  return (
    <View style={[s.segment, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[s.fill, {
          backgroundColor: fillColor,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  track: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg },
  step: { flex: 1, gap: spacing['2xs'], alignItems: 'center' },
  segment: { alignSelf: 'stretch', height: 4, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
  title: { marginBottom: spacing['2xs'] },
})
