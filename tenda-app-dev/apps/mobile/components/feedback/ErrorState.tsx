import { View, StyleSheet, type ViewStyle } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { AlertTriangle } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'

type Size = 'default' | 'large'

interface ErrorStateProps {
  title: string
  description?: string
  meta?: string
  ctaLabel?: string
  onCtaPress?: () => void
  secondaryLabel?: string
  onSecondaryPress?: () => void
  size?: Size
  style?: ViewStyle
}

export function ErrorState({
  title,
  description,
  meta,
  ctaLabel = 'Go back',
  onCtaPress,
  secondaryLabel,
  onSecondaryPress,
  size = 'default',
  style,
}: ErrorStateProps) {
  const { theme } = useUnistyles()
  const router = useRouter()

  const handleCtaPress = onCtaPress ?? (() => router.back())
  const isLarge = size === 'large'

  return (
    <View style={[s.container, isLarge && s.containerLarge, style]}>
      {isLarge && (
        <View style={s.glow}>
          <View
            style={[
              s.glowInner,
              {
                backgroundColor: theme.colors.feedback.danger.surface,
                opacity: 0.5,
              },
            ]}
          />
        </View>
      )}

      <View
        style={[
          isLarge ? s.iconTileLarge : s.iconTile,
          { backgroundColor: theme.colors.feedback.danger.surface },
        ]}
      >
        <AlertTriangle
          size={isLarge ? 32 : 28}
          color={theme.colors.feedback.danger.base}
          strokeWidth={2}
        />
      </View>

      <Text
        style={[
          isLarge ? s.titleLarge : s.title,
          { color: theme.colors.content.primary },
        ]}
      >
        {title}
      </Text>

      {description && (
        <Text
          style={[
            isLarge ? s.bodyLarge : s.body,
            { color: theme.colors.content.secondary },
          ]}
        >
          {description}
        </Text>
      )}

      {meta && (
        <Text style={[s.meta, { color: theme.colors.content.tertiary }]}>
          {meta}
        </Text>
      )}

      <View style={s.actions}>
        <Button variant="primary" size="lg" fullWidth onPress={handleCtaPress}>
          {ctaLabel}
        </Button>
        {secondaryLabel && (
          <Button variant="ghost" size="md" fullWidth onPress={onSecondaryPress}>
            {secondaryLabel}
          </Button>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 14,
  },
  containerLarge: {
    paddingHorizontal: 32,
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: '10%',
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  glowInner: {
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  iconTile: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.27,
    textAlign: 'center',
  },
  titleLarge: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.22,
    textAlign: 'center',
  },
  body: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  bodyLarge: {
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 280,
  },
  meta: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.22,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    maxWidth: 320,
    marginTop: 8,
    gap: 8,
  },
})
